
import os
import threading
import logging
from concurrent.futures import ThreadPoolExecutor
import multiprocessing

# Production Threading configuration
class ProductionThreadingConfig:
    # Calculate optimal thread counts based on worker type
    CPU_COUNT = multiprocessing.cpu_count()
    
    # For Gunicorn with gevent workers
    if os.environ.get('GUNICORN_WORKER_CLASS') == 'gevent':
        DEFAULT_MAX_WORKERS = int(os.environ.get('GEVENT_POOL_SIZE', 1000))
        DEFAULT_THREAD_TIMEOUT = 300
    else:
        # For sync workers or development
        DEFAULT_MAX_WORKERS = int(os.environ.get('MAX_WORKERS', CPU_COUNT * 4))
        DEFAULT_THREAD_TIMEOUT = int(os.environ.get('THREAD_TIMEOUT', 300))
    
    MAX_WORKERS = DEFAULT_MAX_WORKERS
    THREAD_TIMEOUT = DEFAULT_THREAD_TIMEOUT
    
    # Thread pool executor for background tasks
    _executor = None
    _lock = threading.Lock()
    
    @classmethod
    def get_executor(cls):
        """Get or create thread pool executor with production settings"""
        if cls._executor is None:
            with cls._lock:
                if cls._executor is None:
                    logging.info(f"Creating ProductionThreadPoolExecutor with {cls.MAX_WORKERS} workers")
                    cls._executor = ThreadPoolExecutor(
                        max_workers=cls.MAX_WORKERS,
                        thread_name_prefix="deployment_worker"
                    )
        return cls._executor
    
    @classmethod
    def shutdown_executor(cls):
        """Shutdown thread pool executor gracefully"""
        if cls._executor is not None:
            logging.info("Shutting down ProductionThreadPoolExecutor")
            cls._executor.shutdown(wait=True, timeout=30)
            cls._executor = None
    
    @classmethod
    def get_thread_info(cls):
        """Get current threading information for production monitoring"""
        active_threads = threading.active_count()
        current_thread = threading.current_thread()
        
        thread_info = {
            'active_threads': active_threads,
            'current_thread_name': current_thread.name,
            'current_thread_id': current_thread.ident,
            'max_workers': cls.MAX_WORKERS,
            'cpu_count': cls.CPU_COUNT,
            'worker_class': os.environ.get('GUNICORN_WORKER_CLASS', 'sync'),
            'executor_status': 'initialized' if cls._executor else 'not_initialized'
        }
        
        logging.debug(f"Production thread info: {thread_info}")
        return thread_info

# Alias for backward compatibility
ThreadingConfig = ProductionThreadingConfig

# Production Flask app configuration
class ProductionConfig:
    # Environment detection
    ENV = os.environ.get('FLASK_ENV', 'production')
    DEBUG = ENV == 'development'
    TESTING = False
    
    # Threading settings optimized for production
    THREADED = True
    PROCESSES = 1
    
    # Production logging configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE_PATH = os.environ.get('LOG_FILE_PATH', '/app/logs/application.log')
    
    # Gunicorn specific settings
    GUNICORN_WORKERS = int(os.environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
    GUNICORN_WORKER_CLASS = os.environ.get('GUNICORN_WORKER_CLASS', 'gevent')
    GUNICORN_TIMEOUT = int(os.environ.get('GUNICORN_TIMEOUT', 30))
    
    # Deployment settings
    DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')
    
    # Security settings for production
    SECRET_KEY = os.environ.get('SECRET_KEY', 'production-secret-key-change-this')
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'True').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    @staticmethod
    def setup_production_logging():
        """Setup production-grade logging with thread and process information"""
        log_format = '%(asctime)s - %(name)s - %(levelname)s - [PID:%(process)d|Thread:%(thread)d] - %(message)s'
        
        # Ensure log directory exists
        log_dir = os.path.dirname(ProductionConfig.LOG_FILE_PATH)
        os.makedirs(log_dir, exist_ok=True)
        
        # Configure logging handlers
        handlers = [
            logging.StreamHandler(),  # Console output
            logging.FileHandler(ProductionConfig.LOG_FILE_PATH, mode='a', encoding='utf-8')
        ]
        
        logging.basicConfig(
            level=getattr(logging, ProductionConfig.LOG_LEVEL),
            format=log_format,
            handlers=handlers,
            force=True
        )
        
        # Configure specific loggers
        logging.getLogger('gunicorn.error').setLevel(logging.INFO)
        logging.getLogger('gunicorn.access').setLevel(logging.INFO)
        
        # Log production startup information
        logger = logging.getLogger('fix_deployment_orchestrator')
        thread_info = ProductionThreadingConfig.get_thread_info()
        logger.info(f"Production application starting with config: {thread_info}")
        logger.info(f"Gunicorn workers: {ProductionConfig.GUNICORN_WORKERS}")
        logger.info(f"Worker class: {ProductionConfig.GUNICORN_WORKER_CLASS}")

# Backward compatibility
Config = ProductionConfig
