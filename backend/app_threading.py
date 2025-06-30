
"""
Threading integration for app.py
This module provides thread-safe operations for the main Flask application
"""

import threading
import logging
from typing import Dict, Any, List
from backend.thread_manager import thread_manager, thread_safe_update_deployments, thread_safe_log_message

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
