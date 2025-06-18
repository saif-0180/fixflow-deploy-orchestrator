
import logging
import threading
import time
import uuid
from concurrent.futures import Future
from typing import Dict, Callable, Any, Optional
from backend.config import ThreadingConfig

logger = logging.getLogger('fix_deployment_orchestrator.thread_manager')

class ThreadManager:
    """Manages background threads for deployments with proper error handling and monitoring"""
    
    def __init__(self):
        self.active_tasks: Dict[str, Future] = {}
        self.task_lock = threading.Lock()
        
    def submit_task(self, task_func: Callable, task_id: str, *args, **kwargs) -> str:
        """Submit a task to the thread pool with monitoring"""
        try:
            logger.info(f"Submitting task {task_id} to thread pool")
            logger.debug(f"Current thread info: {ThreadingConfig.get_thread_info()}")
            
            executor = ThreadingConfig.get_executor()
            future = executor.submit(self._task_wrapper, task_func, task_id, *args, **kwargs)
            
            with self.task_lock:
                self.active_tasks[task_id] = future
                
            logger.info(f"Task {task_id} submitted successfully. Active tasks: {len(self.active_tasks)}")
            return task_id
            
        except Exception as e:
            logger.error(f"Failed to submit task {task_id}: {str(e)}")
            logger.exception("Task submission error details:")
            raise
    
    def _task_wrapper(self, task_func: Callable, task_id: str, *args, **kwargs):
        """Wrapper for tasks with error handling and cleanup"""
        try:
            logger.info(f"Starting task {task_id} in thread {threading.current_thread().name}")
            result = task_func(task_id, *args, **kwargs)
            logger.info(f"Task {task_id} completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"Task {task_id} failed with error: {str(e)}")
            logger.exception(f"Task {task_id} error details:")
            raise
            
        finally:
            # Clean up task from active tasks
            with self.task_lock:
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
            logger.debug(f"Task {task_id} cleaned up. Remaining active tasks: {len(self.active_tasks)}")
    
    def get_task_status(self, task_id: str) -> Optional[str]:
        """Get status of a specific task"""
        with self.task_lock:
            if task_id not in self.active_tasks:
                return None
                
            future = self.active_tasks[task_id]
            if future.done():
                if future.exception():
                    return "failed"
                else:
                    return "completed"
            else:
                return "running"
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task"""
        with self.task_lock:
            if task_id in self.active_tasks:
                future = self.active_tasks[task_id]
                cancelled = future.cancel()
                logger.info(f"Task {task_id} cancellation {'successful' if cancelled else 'failed'}")
                return cancelled
        return False
    
    def get_active_tasks_count(self) -> int:
        """Get count of active tasks"""
        with self.task_lock:
            return len(self.active_tasks)
    
    def get_thread_status(self) -> Dict[str, Any]:
        """Get comprehensive thread status for debugging"""
        thread_info = ThreadingConfig.get_thread_info()
        
        with self.task_lock:
            active_task_ids = list(self.active_tasks.keys())
            
        status = {
            'thread_info': thread_info,
            'active_tasks_count': len(active_task_ids),
            'active_task_ids': active_task_ids,
            'timestamp': time.time()
        }
        
        logger.debug(f"Thread status: {status}")
        return status

# Global thread manager instance
thread_manager = ThreadManager()

def submit_deployment_task(task_func: Callable, deployment_id: str, *args, **kwargs) -> str:
    """Convenience function to submit deployment tasks"""
    logger.info(f"Submitting deployment task for deployment {deployment_id}")
    return thread_manager.submit_task(task_func, deployment_id, *args, **kwargs)

def get_deployment_status(deployment_id: str) -> Optional[str]:
    """Get status of a deployment task"""
    return thread_manager.get_task_status(deployment_id)

def get_system_thread_status() -> Dict[str, Any]:
    """Get system-wide thread status"""
    return thread_manager.get_thread_status()
