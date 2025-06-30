
import os
import sys
import logging
import threading
import time
from backend.config import Config, ThreadingConfig

def perform_startup_checks():
    """Perform comprehensive startup checks before starting the application"""
    
    # Setup logging first
    Config.setup_logging()
    logger = logging.getLogger('fix_deployment_orchestrator.startup')
    
    logger.info("=" * 50)
    logger.info("STARTING DEPLOYMENT ORCHESTRATOR")
    logger.info("=" * 50)
    
    checks_passed = True
    
    # Check 1: Threading system
    logger.info("1. Checking threading system...")
    try:
        thread_info = ThreadingConfig.get_thread_info()
        logger.info(f"   ✓ Threading system initialized")
        logger.info(f"   ✓ Active threads: {thread_info['active_threads']}")
        logger.info(f"   ✓ Max workers: {thread_info['max_workers']}")
        logger.info(f"   ✓ Current thread: {thread_info['current_thread_name']}")
        
        # Test thread pool creation
        executor = ThreadingConfig.get_executor()
        logger.info(f"   ✓ Thread pool executor created successfully")
        
    except Exception as e:
        logger.error(f"   ✗ Threading system check failed: {str(e)}")
        checks_passed = False
    
    # Check 2: Required directories
    logger.info("2. Checking required directories...")
    required_dirs = [
        '/app/logs',
        '/app/fixfiles/AllFts',
        '/app/inventory',
        '/tmp/ansible-ssh'
    ]
    
    for dir_path in required_dirs:
        try:
            if os.path.exists(dir_path):
                logger.info(f"   ✓ Directory exists: {dir_path}")
            else:
                logger.warning(f"   ! Directory missing: {dir_path}")
                try:
                    os.makedirs(dir_path, exist_ok=True)
                    logger.info(f"   ✓ Created directory: {dir_path}")
                except Exception as create_error:
                    logger.error(f"   ✗ Failed to create directory {dir_path}: {str(create_error)}")
                    checks_passed = False
        except Exception as e:
            logger.error(f"   ✗ Error checking directory {dir_path}: {str(e)}")
            checks_passed = False
    
    # Check 3: Required files
    logger.info("3. Checking required files...")
    required_files = [
        'inventory/inventory.json',
        'inventory/db_inventory.json'
    ]
    
    for file_path in required_files:
        try:
            if os.path.exists(file_path):
                logger.info(f"   ✓ File exists: {file_path}")
            else:
                logger.warning(f"   ! File missing: {file_path} (will use fallback data)")
        except Exception as e:
            logger.error(f"   ✗ Error checking file {file_path}: {str(e)}")
    
    # Check 4: Environment variables
    logger.info("4. Checking environment configuration...")
    env_vars = {
        'FLASK_APP': os.environ.get('FLASK_APP', 'NOT_SET'),
        'FLASK_ENV': os.environ.get('FLASK_ENV', 'NOT_SET'),
        'LOG_FILE_PATH': os.environ.get('LOG_FILE_PATH', 'NOT_SET'),
        'DEPLOYMENT_LOGS_DIR': os.environ.get('DEPLOYMENT_LOGS_DIR', 'NOT_SET'),
        'MAX_WORKERS': os.environ.get('MAX_WORKERS', 'NOT_SET'),
        'PYTHONUNBUFFERED': os.environ.get('PYTHONUNBUFFERED', 'NOT_SET')
    }
    
    for var_name, var_value in env_vars.items():
        if var_value != 'NOT_SET':
            logger.info(f"   ✓ {var_name}: {var_value}")
        else:
            logger.warning(f"   ! {var_name}: Not set (using defaults)")
    
    # Check 5: System resources
    logger.info("5. Checking system resources...")
    try:
        import psutil
        cpu_count = psutil.cpu_count()
        memory = psutil.virtual_memory()
        logger.info(f"   ✓ CPU cores: {cpu_count}")
        logger.info(f"   ✓ Memory: {memory.total // (1024**3)} GB total, {memory.available // (1024**3)} GB available")
    except ImportError:
        logger.warning("   ! psutil not available, skipping resource check")
    except Exception as e:
        logger.warning(f"   ! Resource check failed: {str(e)}")
    
    # Final startup status
    logger.info("=" * 50)
    if checks_passed:
        logger.info("✓ ALL STARTUP CHECKS PASSED")
        logger.info("✓ APPLICATION READY TO START")
    else:
        logger.error("✗ SOME STARTUP CHECKS FAILED")
        logger.error("✗ APPLICATION MAY NOT FUNCTION CORRECTLY")
    logger.info("=" * 50)
    
    return checks_passed

def monitor_system_health():
    """Background thread to monitor system health"""
    logger = logging.getLogger('fix_deployment_orchestrator.health_monitor')
    
    while True:
        try:
            thread_info = ThreadingConfig.get_thread_info()
            logger.debug(f"Health check - Active threads: {thread_info['active_threads']}")
            
            # Check if we're running low on threads
            if thread_info['active_threads'] > (thread_info['max_workers'] * 0.8):
                logger.warning(f"High thread usage: {thread_info['active_threads']}/{thread_info['max_workers']}")
            
            time.sleep(30)  # Check every 30 seconds
            
        except Exception as e:
            logger.error(f"Health monitor error: {str(e)}")
            time.sleep(60)  # Wait longer if there's an error

if __name__ == "__main__":
    perform_startup_checks()
