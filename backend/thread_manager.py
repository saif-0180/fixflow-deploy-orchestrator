
import threading
import time
import logging
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Callable, Any, Optional
import uuid

logger = logging.getLogger('fix_deployment_orchestrator')

class ThreadManager:
    """
    Centralized thread management for the application
    Handles all threading operations including deployment processing
    """
    
    def __init__(self, max_workers: Optional[int] = None):
        # Default to 10 workers if not specified, suitable for deployment tasks
        self.max_workers = max_workers or 10
        self.executor = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="DeploymentWorker")
        self.active_threads: Dict[str, threading.Thread] = {}
        self.thread_results: Dict[str, Any] = {}
        self.shutdown_event = threading.Event()
        
        # Thread-safe logging queue
        self.log_queue = queue.Queue()
        
        logger.info(f"ThreadManager initialized with {self.max_workers} workers")
    
    def submit_deployment_task(self, task_func: Callable, task_id: str, *args, **kwargs) -> str:
        """
        Submit a deployment task to the thread pool
        Returns the task ID for tracking
        """
        try:
            future = self.executor.submit(self._wrapped_task, task_func, task_id, *args, **kwargs)
            logger.info(f"Submitted deployment task {task_id} to thread pool")
            return task_id
        except Exception as e:
            logger.error(f"Failed to submit task {task_id}: {str(e)}")
            raise
    
    def _wrapped_task(self, task_func: Callable, task_id: str, *args, **kwargs):
        """
        Wrapper for tasks to handle logging and error tracking
        """
        thread_name = threading.current_thread().name
        logger.info(f"Starting task {task_id} in thread {thread_name}")
        
        try:
            result = task_func(task_id, *args, **kwargs)
            self.thread_results[task_id] = {"status": "success", "result": result}
            logger.info(f"Task {task_id} completed successfully in thread {thread_name}")
            return result
        except Exception as e:
            error_msg = f"Task {task_id} failed in thread {thread_name}: {str(e)}"
            logger.error(error_msg)
            self.thread_results[task_id] = {"status": "error", "error": str(e)}
            raise
    
    def create_background_thread(self, target_func: Callable, thread_name: str, *args, **kwargs) -> str:
        """
        Create a background thread for long-running tasks
        Returns thread ID for tracking
        """
        thread_id = str(uuid.uuid4())
        
        def wrapped_target():
            try:
                logger.info(f"Background thread {thread_name} started")
                target_func(*args, **kwargs)
                logger.info(f"Background thread {thread_name} completed")
            except Exception as e:
                logger.error(f"Background thread {thread_name} failed: {str(e)}")
            finally:
                # Clean up thread reference
                if thread_id in self.active_threads:
                    del self.active_threads[thread_id]
        
        thread = threading.Thread(
            target=wrapped_target,
            name=thread_name,
            daemon=True
        )
        
        self.active_threads[thread_id] = thread
        thread.start()
        logger.info(f"Created background thread {thread_name} with ID {thread_id}")
        
        return thread_id
    
    def get_thread_status(self, thread_id: str) -> Dict[str, Any]:
        """
        Get status of a specific thread
        """
        if thread_id in self.active_threads:
            thread = self.active_threads[thread_id]
            return {
                "thread_id": thread_id,
                "name": thread.name,
                "alive": thread.is_alive(),
                "daemon": thread.daemon
            }
        elif thread_id in self.thread_results:
            return {
                "thread_id": thread_id,
                "completed": True,
                **self.thread_results[thread_id]
            }
        else:
            return {"thread_id": thread_id, "status": "not_found"}
    
    def get_active_threads_count(self) -> int:
        """
        Get count of currently active threads
        """
        return len([t for t in self.active_threads.values() if t.is_alive()])
    
    def get_thread_pool_status(self) -> Dict[str, Any]:
        """
        Get status of the thread pool executor
        """
        return {
            "max_workers": self.max_workers,
            "active_threads": self.get_active_threads_count(),
            "shutdown": self.executor._shutdown
        }
    
    def log_thread_safe(self, message: str, level: str = "info"):
        """
        Thread-safe logging method
        """
        log_entry = {
            "timestamp": time.time(),
            "thread_name": threading.current_thread().name,
            "level": level,
            "message": message
        }
        self.log_queue.put(log_entry)
        
        # Also log immediately for debugging
        getattr(logger, level, logger.info)(f"[{threading.current_thread().name}] {message}")
    
    def cleanup_completed_threads(self):
        """
        Clean up references to completed threads
        """
        completed_threads = []
        for thread_id, thread in self.active_threads.items():
            if not thread.is_alive():
                completed_threads.append(thread_id)
        
        for thread_id in completed_threads:
            del self.active_threads[thread_id]
            logger.debug(f"Cleaned up completed thread {thread_id}")
    
    def shutdown(self, wait: bool = True, timeout: float = 30.0):
        """
        Shutdown the thread manager gracefully
        """
        logger.info("Shutting down ThreadManager...")
        
        # Signal shutdown to all threads
        self.shutdown_event.set()
        
        # Shutdown the thread pool executor
        self.executor.shutdown(wait=wait, timeout=timeout)
        
        # Wait for background threads to complete
        if wait:
            for thread_id, thread in self.active_threads.items():
                if thread.is_alive():
                    logger.info(f"Waiting for thread {thread_id} to complete...")
                    thread.join(timeout=5.0)
                    if thread.is_alive():
                        logger.warning(f"Thread {thread_id} did not complete within timeout")
        
        logger.info("ThreadManager shutdown completed")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()

# Global thread manager instance
thread_manager = ThreadManager()

# Convenience functions for backward compatibility
def create_deployment_thread(target_func: Callable, thread_name: str, *args, **kwargs) -> str:
    """Create a deployment thread using the global thread manager"""
    return thread_manager.create_background_thread(target_func, thread_name, *args, **kwargs)

def submit_deployment_task(task_func: Callable, task_id: str, *args, **kwargs) -> str:
    """Submit a deployment task using the global thread manager"""
    return thread_manager.submit_deployment_task(task_func, task_id, *args, **kwargs)

def get_thread_status(thread_id: str) -> Dict[str, Any]:
    """Get thread status using the global thread manager"""
    return thread_manager.get_thread_status(thread_id)

def cleanup_threads():
    """Clean up completed threads using the global thread manager"""
    thread_manager.cleanup_completed_threads()
