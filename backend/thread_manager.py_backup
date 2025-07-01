
import threading
import time
import logging
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Callable, Any, Optional
import uuid
from backend.thread_monitor import thread_monitor, monitor_thread_creation

logger = logging.getLogger('fix_deployment_orchestrator')

class ThreadManager:
    """
    Centralized thread management for the application with comprehensive debugging
    """
    
    def __init__(self, max_workers: Optional[int] = None):
        # Ultra-conservative threading for Docker
        self.max_workers = max_workers or 2
        
        logger.info(f"THREAD_INIT: Initializing ThreadManager with {self.max_workers} workers")
        thread_monitor.log_thread_creation("ThreadManager", "manager")
        
        # Check if we can create threads before initializing executor
        if not monitor_thread_creation("Pre-ThreadPoolExecutor", "check"):
            logger.error("THREAD_ERROR: Cannot create ThreadPoolExecutor - thread limit reached")
            raise RuntimeError("Thread limit reached during initialization")
        
        try:
            self.executor = ThreadPoolExecutor(
                max_workers=self.max_workers, 
                thread_name_prefix="DeployWorker"
            )
            logger.info(f"THREAD_SUCCESS: ThreadPoolExecutor created successfully")
        except Exception as e:
            logger.error(f"THREAD_ERROR: Failed to create ThreadPoolExecutor: {e}")
            raise
        
        self.active_threads: Dict[str, threading.Thread] = {}
        self.thread_results: Dict[str, Any] = {}
        self.shutdown_event = threading.Event()
        
        # Thread-safe logging queue
        self.log_queue = queue.Queue()
        
        # Thread-safe dictionaries for shared data
        self._lock = threading.RLock()
        
        logger.info(f"THREAD_INIT: ThreadManager initialized successfully")
        thread_monitor.log_active_threads()
    
    def submit_deployment_task(self, task_func: Callable, task_id: str, *args, **kwargs) -> str:
        """Submit a deployment task with thread monitoring"""
        logger.info(f"THREAD_SUBMIT: Attempting to submit task {task_id}")
        
        # Check thread limits before submission
        if not monitor_thread_creation(f"Task-{task_id}", "deployment"):
            logger.error(f"THREAD_ERROR: Cannot submit task {task_id} - thread limit reached")
            raise RuntimeError(f"Thread limit reached, cannot submit task {task_id}")
        
        try:
            future = self.executor.submit(self._wrapped_task, task_func, task_id, *args, **kwargs)
            logger.info(f"THREAD_SUCCESS: Submitted deployment task {task_id}")
            return task_id
        except Exception as e:
            logger.error(f"THREAD_ERROR: Failed to submit task {task_id}: {str(e)}")
            thread_monitor.log_active_threads()
            raise
    
    def _wrapped_task(self, task_func: Callable, task_id: str, *args, **kwargs):
        """Wrapper for tasks with comprehensive logging"""
        thread_name = threading.current_thread().name
        logger.info(f"THREAD_TASK_START: Task {task_id} starting in thread {thread_name}")
        
        try:
            result = task_func(task_id, *args, **kwargs)
            with self._lock:
                self.thread_results[task_id] = {"status": "success", "result": result}
            logger.info(f"THREAD_TASK_SUCCESS: Task {task_id} completed in thread {thread_name}")
            return result
        except Exception as e:
            error_msg = f"Task {task_id} failed in thread {thread_name}: {str(e)}"
            logger.error(f"THREAD_TASK_ERROR: {error_msg}")
            with self._lock:
                self.thread_results[task_id] = {"status": "error", "error": str(e)}
            raise
        finally:
            logger.info(f"THREAD_TASK_END: Task {task_id} finished in thread {thread_name}")
    
    def create_background_thread(self, target_func: Callable, thread_name: str, *args, **kwargs) -> str:
        """Create background thread with strict limits and monitoring"""
        current_count = threading.active_count()
        logger.info(f"THREAD_BG_REQUEST: Request to create background thread '{thread_name}' "
                   f"(Current active: {current_count})")
        
        # Very strict limits for background threads
        if current_count >= 8:  # Very low limit
            logger.error(f"THREAD_BG_REJECT: Too many active threads ({current_count}), "
                        f"rejecting background thread '{thread_name}'")
            thread_monitor.log_active_threads()
            raise RuntimeError(f"Maximum active threads exceeded ({current_count})")
        
        if not monitor_thread_creation(thread_name, "background"):
            logger.error(f"THREAD_BG_REJECT: Thread monitor rejected creation of '{thread_name}'")
            raise RuntimeError("Thread monitor rejected thread creation")
        
        thread_id = str(uuid.uuid4())
        
        def wrapped_target():
            try:
                logger.info(f"THREAD_BG_START: Background thread {thread_name} started")
                target_func(*args, **kwargs)
                logger.info(f"THREAD_BG_SUCCESS: Background thread {thread_name} completed")
            except Exception as e:
                logger.error(f"THREAD_BG_ERROR: Background thread {thread_name} failed: {str(e)}")
            finally:
                logger.info(f"THREAD_BG_CLEANUP: Cleaning up background thread {thread_name}")
                with self._lock:
                    if thread_id in self.active_threads:
                        del self.active_threads[thread_id]
        
        try:
            thread = threading.Thread(
                target=wrapped_target,
                name=thread_name,
                daemon=True
            )
            
            with self._lock:
                self.active_threads[thread_id] = thread
            
            thread.start()
            logger.info(f"THREAD_BG_SUCCESS: Created background thread {thread_name} with ID {thread_id}")
            thread_monitor.log_active_threads()
            
            return thread_id
            
        except Exception as e:
            logger.error(f"THREAD_BG_CREATION_ERROR: Failed to create background thread {thread_name}: {e}")
            thread_monitor.log_active_threads()
            raise
    
    def get_thread_pool_status(self) -> Dict[str, Any]:
        """Get thread pool executor status"""
        try:
            return {
                "max_workers": self.max_workers,
                "active_tasks": len(self.thread_results),
                "shutdown_requested": self.shutdown_event.is_set()
            }
        except Exception as e:
            logger.error(f"Error getting thread pool status: {e}")
            return {"error": str(e)}
    
    def get_active_threads_count(self) -> int:
        """Get count of active threads"""
        with self._lock:
            return len(self.active_threads)
    
    def cleanup_completed_threads(self):
        """Clean up completed threads"""
        with self._lock:
            completed_threads = []
            for thread_id, thread in self.active_threads.items():
                if not thread.is_alive():
                    completed_threads.append(thread_id)
            
            for thread_id in completed_threads:
                del self.active_threads[thread_id]
                logger.info(f"THREAD_CLEANUP: Removed completed thread {thread_id}")
    
    def thread_safe_operation(self, operation: Callable) -> Any:
        """Execute operation in thread-safe manner"""
        with self._lock:
            try:
                return operation()
            except Exception as e:
                logger.error(f"THREAD_SAFE_OP_ERROR: {str(e)}")
                raise
    
    def get_comprehensive_status(self) -> Dict[str, Any]:
        """Get comprehensive threading status with debugging info"""
        return {
            "thread_pool": self.get_thread_pool_status(),
            "monitor_report": thread_monitor.get_thread_report(),
            "system_threads": threading.active_count(),
            "main_thread": threading.main_thread().name,
            "current_thread": threading.current_thread().name
        }
    
    def shutdown(self, wait: bool = True, timeout: float = 5.0):
        """Shutdown with comprehensive logging"""
        logger.info("THREAD_SHUTDOWN: Starting ThreadManager shutdown...")
        thread_monitor.log_active_threads()
        
        # Signal shutdown to all threads
        self.shutdown_event.set()
        
        # Shutdown the thread pool executor with very short timeout
        try:
            self.executor.shutdown(wait=wait, timeout=timeout)
            logger.info("THREAD_SHUTDOWN: ThreadPoolExecutor shutdown completed")
        except Exception as e:
            logger.error(f"THREAD_SHUTDOWN_ERROR: Error shutting down executor: {e}")
        
        # Wait for background threads with short timeout
        if wait:
            with self._lock:
                active_threads_copy = dict(self.active_threads)
            
            for thread_id, thread in active_threads_copy.items():
                if thread.is_alive():
                    logger.info(f"THREAD_SHUTDOWN: Waiting for thread {thread_id}...")
                    thread.join(timeout=1.0)  # Very short timeout
                    if thread.is_alive():
                        logger.warning(f"THREAD_SHUTDOWN: Thread {thread_id} did not complete")
        
        logger.info("THREAD_SHUTDOWN: ThreadManager shutdown completed")
        thread_monitor.log_active_threads()

# Global thread manager instance
thread_manager = ThreadManager(max_workers=2)

def thread_safe_update_deployments(deployments: Dict, deployment_id: str, updates: Dict) -> Dict:
    """Thread-safe deployment update"""
    def update_operation():
        if deployment_id in deployments:
            deployments[deployment_id].update(updates)
            logger.info(f"THREAD_SAFE: Updated deployment {deployment_id}")
        return deployments
    
    return thread_manager.thread_safe_operation(update_operation)

def thread_safe_log_message(deployments: Dict, deployment_id: str, message: str) -> bool:
    """Thread-safe deployment log message"""
    def log_operation():
        if deployment_id in deployments:
            if 'logs' not in deployments[deployment_id]:
                deployments[deployment_id]['logs'] = []
            deployments[deployment_id]['logs'].append(message)
            logger.info(f"THREAD_SAFE: Added log to deployment {deployment_id}")
            return True
        return False
    
    return thread_manager.thread_safe_operation(log_operation)

def get_thread_manager_status():
    """Get comprehensive thread manager status"""
    return thread_manager.get_comprehensive_status()
