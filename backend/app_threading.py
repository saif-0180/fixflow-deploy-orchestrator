
"""
Threading integration for app.py
This module provides thread-safe operations for the main Flask application
"""

import threading
import logging
from typing import Dict, Any, List, Callable
from backend.thread_manager import thread_manager, thread_safe_update_deployments, thread_safe_log_message, safe_start_thread

logger = logging.getLogger('fix_deployment_orchestrator')

class AppThreadingManager:
    """
    Thread management specifically for app.py operations
    Handles shared state management and thread-safe operations
    """
    
    def __init__(self):
        self._lock = threading.RLock()
        logger.info("AppThreadingManager initialized")
    
    def safe_update_deployment(self, deployments: Dict, deployment_id: str, updates: Dict) -> Dict:
        """
        Thread-safe deployment update
        """
        return thread_safe_update_deployments(deployments, deployment_id, updates)
    
    def safe_log_deployment_message(self, deployments: Dict, deployment_id: str, message: str) -> bool:
        """
        Thread-safe deployment logging
        """
        return thread_safe_log_message(deployments, deployment_id, message)
    
    def safe_save_deployment_history(self, save_func, *args, **kwargs):
        """
        Thread-safe deployment history saving
        """
        def save_operation():
            return save_func(*args, **kwargs)
        
        return thread_manager.thread_safe_operation(save_operation)
    
    def safe_start_operation_thread(self, target_func: Callable, operation_name: str, *args, **kwargs) -> bool:
        """
        Safely start an operation thread - replaces direct threading.Thread().start()
        This is the recommended way to start threads for Flask operations
        """
        thread_name = f"Operation-{operation_name}"
        logger.info(f"APP_THREADING: Attempting to start operation thread: {thread_name}")
        
        success = safe_start_thread(target_func, thread_name, *args, **kwargs)
        
        if success:
            logger.info(f"APP_THREADING: Successfully started operation thread: {thread_name}")
        else:
            logger.error(f"APP_THREADING: Failed to start operation thread: {thread_name}")
            
        return success
    
    def cleanup_ssh_threads(self):
        """
        Clean up SSH-related threads after connection tests
        """
        logger.info("THREAD_CLEANUP: Starting SSH thread cleanup")
        
        # Force cleanup of completed threads
        thread_manager.cleanup_completed_threads()
        
        # Wait a moment for threads to finish
        import time
        time.sleep(0.1)
        
        # Get current thread count
        current_count = threading.active_count()
        logger.info(f"THREAD_CLEANUP: Thread count after SSH cleanup: {current_count}")
        
        # If still too many threads, force garbage collection
        if current_count > 5:
            import gc
            gc.collect()
            logger.info("THREAD_CLEANUP: Forced garbage collection")
    
    def get_threading_status(self) -> Dict[str, Any]:
        """
        Get comprehensive threading status for the application
        """
        return {
            "thread_manager_status": thread_manager.get_thread_pool_status(),
            "active_threads": thread_manager.get_active_threads_count(),
            "main_thread": threading.main_thread().name,
            "current_thread": threading.current_thread().name
        }
    
    def cleanup_and_maintenance(self):
        """
        Perform cleanup and maintenance tasks
        """
        thread_manager.cleanup_completed_threads()
        logger.info("Threading cleanup completed")

# Global instance for app.py
app_threading_manager = AppThreadingManager()

# Convenience functions for app.py
def get_app_threading_status():
    """Get application threading status"""
    return app_threading_manager.get_threading_status()

def safe_deployment_update(deployments, deployment_id, updates):
    """Safe deployment update for app.py"""
    return app_threading_manager.safe_update_deployment(deployments, deployment_id, updates)

def safe_deployment_log(deployments, deployment_id, message):
    """Safe deployment logging for app.py"""
    return app_threading_manager.safe_log_deployment_message(deployments, deployment_id, message)

def safe_save_history(save_func, *args, **kwargs):
    """Safe history saving for app.py"""
    return app_threading_manager.safe_save_deployment_history(save_func, *args, **kwargs)

def perform_threading_cleanup():
    """Perform threading cleanup"""
    app_threading_manager.cleanup_and_maintenance()

def cleanup_ssh_threads():
    """Clean up SSH threads after connection tests"""
    app_threading_manager.cleanup_ssh_threads()

def start_operation_thread(target_func: Callable, operation_name: str, *args, **kwargs) -> bool:
    """
    Start an operation thread safely - this should replace all direct threading.Thread().start() calls
    Returns True if thread was started successfully, False otherwise
    """
    return app_threading_manager.safe_start_operation_thread(target_func, operation_name, *args, **kwargs)
