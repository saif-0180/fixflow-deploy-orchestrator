
import os
import threading
import logging
from concurrent.futures import ThreadPoolExecutor

# Threading configuration
class ThreadingConfig:
    # Default thread pool sizes
    DEFAULT_MAX_WORKERS = 10
    DEFAULT_THREAD_TIMEOUT = 300  # 5 minutes
    
    # Get thread configuration from environment or use defaults
    MAX_WORKERS = int(os.environ.get('MAX_WORKERS', DEFAULT_MAX_WORKERS))
    THREAD_TIMEOUT = int(os.environ.get('THREAD_TIMEOUT', DEFAULT_THREAD_TIMEOUT))
    
    # Thread pool executor for background tasks
    _executor = None
    _lock = threading.Lock()
    
    @classmethod
    def get_executor(cls):
        """Get or create thread pool executor"""
        if cls._executor is None:
            with cls._lock:
                if cls._executor is None:
                    logging.info(f"Creating ThreadPoolExecutor with {cls.MAX_WORKERS} workers")
                    cls._executor = ThreadPoolExecutor(
                        max_workers=cls.MAX_WORKERS,
                        thread_name_prefix="deployment_worker"
                    )
        return cls._executor
    
    @classmethod
    def shutdown_executor(cls):
        """Shutdown thread pool executor"""
        if cls._executor is not None:
            logging.info("Shutting down ThreadPoolExecutor")
            cls._executor.shutdown(wait=True)
            cls._executor = None
    
    @classmethod
    def get_thread_info(cls):
        """Get current threading information for debugging"""
        active_threads = threading.active_count()
        current_thread = threading.current_thread()
        
        thread_info = {
            'active_threads': active_threads,
            'current_thread_name': current_thread.name,
            'current_thread_id': current_thread.ident,
            'max_workers': cls.MAX_WORKERS,
            'executor_status': 'initialized' if cls._executor else 'not_initialized'
        }
        
        logging.debug(f"Thread info: {thread_info}")
        return thread_info

# Flask app configuration
class Config:
    # Threading settings for Flask
    THREADED = True
    PROCESSES = 1
    
    # Debug settings
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # Logging configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE_PATH = os.environ.get('LOG_FILE_PATH', '/app/logs/application.log')
    
    # Deployment settings
    DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')
    
    @staticmethod
    def setup_logging():
        """Setup logging configuration with thread information"""
        log_format = '%(asctime)s - %(name)s - %(levelname)s - [Thread:%(thread)d] - %(message)s'
        
        logging.basicConfig(
            level=getattr(logging, Config.LOG_LEVEL),
            format=log_format,
            handlers=[
                logging.StreamHandler(),  # Console output
                logging.FileHandler(Config.LOG_FILE_PATH) if os.path.exists(os.path.dirname(Config.LOG_FILE_PATH)) else logging.NullHandler()
            ]
        )
        
        # Log thread information at startup
        logger = logging.getLogger('fix_deployment_orchestrator')
        thread_info = ThreadingConfig.get_thread_info()
        logger.info(f"Application starting with threading config: {thread_info}")
