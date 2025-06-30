
#!/usr/bin/env python3
"""
Enhanced server startup with threading debug and Gunicorn support
"""

import os
import sys
import logging
import argparse
from backend.thread_monitor import thread_monitor, log_app_startup

# Set up logging before importing anything else
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/application.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('fix_deployment_orchestrator')

def start_with_gunicorn():
    """Start the application using Gunicorn"""
    logger.info("STARTUP: Starting application with Gunicorn")
    log_app_startup()
    
    # Import after logging setup
    from backend.app import app
    
    # Gunicorn command
    cmd = [
        'gunicorn',
        '--config', 'backend/gunicorn_config.py',
        'backend.app:app'
    ]
    
    logger.info(f"STARTUP: Executing command: {' '.join(cmd)}")
    os.execvp('gunicorn', cmd)

def start_with_waitress():
    """Start the application using Waitress (fallback)"""
    logger.info("STARTUP: Starting application with Waitress (fallback)")
    log_app_startup()
    
    from waitress import serve
    from backend.app import app
    
    # Very conservative Waitress settings
    serve(
        app, 
        host="0.0.0.0", 
        port=5000,
        threads=2,  # Minimal threads
        connection_limit=20,
        cleanup_interval=10,
        channel_timeout=60
    )

def main():
    parser = argparse.ArgumentParser(description='Start the Fix Deployment Orchestrator')
    parser.add_argument('--server', choices=['gunicorn', 'waitress'], 
                       default='gunicorn', help='Server to use')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.info("DEBUG mode enabled")
    
    try:
        if args.server == 'gunicorn':
            start_with_gunicorn()
        else:
            start_with_waitress()
    except Exception as e:
        logger.error(f"STARTUP_ERROR: Failed to start server: {e}")
        thread_monitor.log_active_threads()
        sys.exit(1)

if __name__ == '__main__':
    main()
