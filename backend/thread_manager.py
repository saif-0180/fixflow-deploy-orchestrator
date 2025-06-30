
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
        # Reduce to 3 workers to prevent thread exhaustion in Docker
        self.max_workers = max_workers or 3
        self.executor = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="DeploymentWorker")
        self.active_threads: Dict[str, threading.Thread] = {}
        self.thread_results: Dict[str, Any] = {}
        self.shutdown_event = threading.Event()
        
        # Thread-safe logging queue
        self.log_queue = queue.Queue()
        
        # Thread-safe dictionaries for shared data
        self._lock = threading.RLock()
        
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
            with self._lock:
                self.thread_results[task_id] = {"status": "success", "result": result}
            logger.info(f"Task {task_id} completed successfully in thread {thread_name}")
            return result
        except Exception as e:
            error_msg = f"Task {task_id} failed in thread {thread_name}: {str(e)}"
            logger.error(error_msg)
            with self._lock:
                self.thread_results[task_id] = {"status": "error", "error": str(e)}
            raise
    
    def create_background_thread(self, target_func: Callable, thread_name: str, *args, **kwargs) -> str:
        """
        Create a background thread for long-running tasks with safeguards
        Returns thread ID for tracking
        """
        # Check current thread count before creating new ones
        current_count = self.get_active_threads_count()
        if current_count >= 5:  # Limit background threads
            logger.warning(f"Too many active threads ({current_count}), rejecting new thread creation")
            raise RuntimeError("Maximum active threads exceeded")
        
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
                with self._lock:
                    if thread_id in self.active_threads:
                        del self.active_threads[thread_id]
        
        thread = threading.Thread(
            target=wrapped_target,
            name=thread_name,
            daemon=True
        )
        
        with self._lock:
            self.active_threads[thread_id] = thread
        thread.start()
        logger.info(f"Created background thread {thread_name} with ID {thread_id}")
        
        return thread_id
    
    def get_thread_status(self, thread_id: str) -> Dict[str, Any]:
        """
        Get status of a specific thread
        """
        with self._lock:
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
        with self._lock:
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
    
    def thread_safe_operation(self, operation_func: Callable, *args, **kwargs):
        """
        Execute an operation in a thread-safe manner
        """
        with self._lock:
            return operation_func(*args, **kwargs)
    
    def cleanup_completed_threads(self):
        """
        Clean up references to completed threads
        """
        with self._lock:
            completed_threads = []
            for thread_id, thread in self.active_threads.items():
                if not thread.is_alive():
                    completed_threads.append(thread_id)
            
            for thread_id in completed_threads:
                del self.active_threads[thread_id]
                logger.debug(f"Cleaned up completed thread {thread_id}")
    
    def shutdown(self, wait: bool = True, timeout: float = 10.0):
        """
        Shutdown the thread manager gracefully with shorter timeout
        """
        logger.info("Shutting down ThreadManager...")
        
        # Signal shutdown to all threads
        self.shutdown_event.set()
        
        # Shutdown the thread pool executor with shorter timeout
        self.executor.shutdown(wait=wait, timeout=timeout)
        
        # Wait for background threads to complete with shorter timeout
        if wait:
            with self._lock:
                active_threads_copy = dict(self.active_threads)
            
            for thread_id, thread in active_threads_copy.items():
                if thread.is_alive():
                    logger.info(f"Waiting for thread {thread_id} to complete...")
                    thread.join(timeout=2.0)  # Reduced timeout
                    if thread.is_alive():
                        logger.warning(f"Thread {thread_id} did not complete within timeout")
        
        logger.info("ThreadManager shutdown completed")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()

# Global thread manager instance with reduced workers
thread_manager = ThreadManager(max_workers=3)

# ... keep existing code (convenience functions)
