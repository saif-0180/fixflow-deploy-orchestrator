
import threading
import time
import logging
import queue
import resource
import gc
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Callable, Any, Optional
import uuid
from backend.thread_monitor import thread_monitor

logger = logging.getLogger('fix_deployment_orchestrator')

def safe_monitor_thread_creation(thread_name: str, context: str) -> bool:
    """Safe wrapper for thread creation monitoring that handles unlimited limits"""
    try:
        current_threads = threading.active_count()
        
        # Get process limits
        try:
            soft_limit, hard_limit = resource.getrlimit(resource.RLIMIT_NPROC)
            logger.debug(f"THREAD_LIMITS: Soft: {soft_limit}, Hard: {hard_limit}, Current: {current_threads}")
            
            # -1 means unlimited - but still check reasonable limits
            if soft_limit == -1:
                # Even with unlimited, don't allow too many threads
                if current_threads >= 20:
                    logger.warning(f"THREAD_CHECK_WARN: Too many threads even with unlimited limit: {current_threads}")
                    return False
                logger.debug(f"THREAD_CHECK_OK: Unlimited process limit, allowing {thread_name}")
                return True
                
            # Check if we're approaching the actual limit
            if current_threads >= min(soft_limit * 0.8, 15):  # Cap at 15 threads or 80% of limit
                logger.warning(f"THREAD_CHECK_WARN: Approaching limit for {thread_name}: {current_threads}/{soft_limit}")
                return False
                
            logger.debug(f"THREAD_CHECK_OK: Safe to create {thread_name}: {current_threads}/{soft_limit}")
            return True
            
        except Exception as e:
            logger.warning(f"THREAD_CHECK_FALLBACK: Could not check limits for {thread_name}: {e}")
            # Conservative fallback - allow if we have reasonable thread count
            return current_threads < 10
            
    except Exception as e:
        logger.warning(f"THREAD_CHECK_ERROR: Error in thread monitoring for {thread_name}: {e}")
        # If monitoring fails, be very conservative
        return threading.active_count() < 5

class ThreadManager:
    """
    Centralized thread management for the application with comprehensive debugging
    Now runs operations synchronously to avoid Docker thread restrictions
    """

    def __init__(self, max_workers: Optional[int] = None):
        # For Docker deployment, we'll run operations synchronously
        self.max_workers = max_workers or 1
        self.sync_mode = True  # Force synchronous mode for Docker

        logger.info(f"THREAD_INIT: Initializing ThreadManager in sync mode")
        thread_monitor.log_thread_creation("ThreadManager", "manager")

        # Don't create ThreadPoolExecutor in sync mode
        self.executor = None
        
        if not self.sync_mode:
            # Use safe thread monitoring instead of the problematic one
            if not safe_monitor_thread_creation("Pre-ThreadPoolExecutor", "check"):
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

        logger.info(f"THREAD_INIT: ThreadManager initialized successfully in {'sync' if self.sync_mode else 'async'} mode")
        thread_monitor.log_active_threads()

    def safe_thread_start(self, target_func: Callable, thread_name: str, *args, **kwargs) -> bool:
        """
        Safely start a thread with comprehensive error handling and cleanup
        In sync mode, runs the function directly instead of creating a thread
        """
        current_count = threading.active_count()
        logger.info(f"THREAD_SAFE_START: Request to start thread '{thread_name}' "
                   f"(Current active: {current_count})")

        if self.sync_mode:
            # Run synchronously instead of creating threads
            logger.info(f"SYNC_MODE: Running {thread_name} synchronously")
            try:
                logger.info(f"SYNC_MODE: Starting execution of {thread_name}")
                target_func(*args, **kwargs)
                logger.info(f"SYNC_MODE: Successfully completed {thread_name}")
                return True
            except Exception as e:
                logger.error(f"SYNC_MODE: Error executing {thread_name}: {str(e)}")
                return False

        # Original async logic (kept for non-Docker environments)
        # Very strict limits - prevent "can't start new thread" error
        if current_count >= 3:  # Ultra low limit for pure sync mode
            logger.error(f"THREAD_SAFE_START_REJECT: Too many active threads ({current_count}), "
                        f"rejecting thread '{thread_name}'")
            thread_monitor.log_active_threads()
            return False

        # Use safe thread monitoring
        if not safe_monitor_thread_creation(thread_name, "safe_start"):
            logger.error(f"THREAD_SAFE_START_REJECT: Thread monitor rejected creation of '{thread_name}'")
            return False

        # Force cleanup before creating new thread
        self.cleanup_completed_threads()
        gc.collect()

        thread_id = str(uuid.uuid4())

        def wrapped_target():
            try:
                logger.info(f"THREAD_SAFE_START: Thread {thread_name} started")
                target_func(*args, **kwargs)
                logger.info(f"THREAD_SAFE_START: Thread {thread_name} completed successfully")
            except Exception as e:
                logger.error(f"THREAD_SAFE_START_ERROR: Thread {thread_name} failed: {str(e)}")
            finally:
                logger.info(f"THREAD_SAFE_START_CLEANUP: Cleaning up thread {thread_name}")
                with self._lock:
                    if thread_id in self.active_threads:
                        del self.active_threads[thread_id]
                # Force cleanup after thread completion
                self.cleanup_completed_threads()
                gc.collect()

        try:
            thread = threading.Thread(
                target=wrapped_target,
                name=thread_name,
                daemon=True
            )

            with self._lock:
                self.active_threads[thread_id] = thread

            thread.start()
            logger.info(f"THREAD_SAFE_START_SUCCESS: Started thread {thread_name} with ID {thread_id}")
            return True

        except RuntimeError as e:
            if "can't start new thread" in str(e):
                logger.error(f"THREAD_SAFE_START_RUNTIME_ERROR: Cannot start thread {thread_name}: {e}")
                # Emergency cleanup
                self.emergency_thread_cleanup()
                return False
            else:
                logger.error(f"THREAD_SAFE_START_OTHER_ERROR: Failed to start thread {thread_name}: {e}")
                return False
        except Exception as e:
            logger.error(f"THREAD_SAFE_START_EXCEPTION: Failed to start thread {thread_name}: {e}")
            return False

    def emergency_thread_cleanup(self):
        """Emergency thread cleanup when we hit thread limits"""
        logger.warning("THREAD_EMERGENCY_CLEANUP: Starting emergency thread cleanup")
        
        # Force cleanup of completed threads
        self.cleanup_completed_threads()
        
        # Multiple garbage collection cycles
        for i in range(3):
            gc.collect()
            time.sleep(0.1)
        
        # Log status after cleanup
        current_count = threading.active_count()
        logger.warning(f"THREAD_EMERGENCY_CLEANUP: Thread count after cleanup: {current_count}")
        thread_monitor.log_active_threads()

    def submit_deployment_task(self, task_func: Callable, task_id: str, *args, **kwargs) -> str:
        """Submit a deployment task with thread monitoring"""
        logger.info(f"THREAD_SUBMIT: Attempting to submit task {task_id}")

        if self.sync_mode:
            # Run synchronously
            logger.info(f"SYNC_MODE: Running task {task_id} synchronously")
            try:
                result = self._wrapped_task(task_func, task_id, *args, **kwargs)
                logger.info(f"SYNC_MODE: Task {task_id} completed successfully")
                return task_id
            except Exception as e:
                logger.error(f"SYNC_MODE: Task {task_id} failed: {str(e)}")
                raise

        # Use safe thread monitoring
        if not safe_monitor_thread_creation(f"Task-{task_id}", "deployment"):
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
        # Use the new safe_thread_start method
        success = self.safe_thread_start(target_func, thread_name, *args, **kwargs)
        if success:
            return thread_name  # Return thread name as ID
        else:
            raise RuntimeError(f"Failed to start background thread: {thread_name}")

    def force_cleanup_ssh_threads(self):
        """Force cleanup of SSH-related threads"""
        logger.info("THREAD_SSH_CLEANUP: Starting forced SSH thread cleanup")
        
        # Cleanup completed threads
        self.cleanup_completed_threads()
        
        # Force garbage collection
        gc.collect()
        
        # Wait for cleanup
        time.sleep(0.2)
        
        current_count = threading.active_count()
        logger.info(f"THREAD_SSH_CLEANUP: Thread count after cleanup: {current_count}")
        
        # Log remaining threads
        thread_monitor.log_active_threads()

    def get_thread_pool_status(self) -> Dict[str, Any]:
        """Get thread pool executor status"""
        try:
            return {
                "max_workers": self.max_workers,
                "active_tasks": len(self.thread_results),
                "shutdown_requested": self.shutdown_event.is_set(),
                "sync_mode": self.sync_mode
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
            "current_thread": threading.current_thread().name,
            "sync_mode": self.sync_mode
        }

    def shutdown(self, wait: bool = True, timeout: float = 3.0):
        """Shutdown with comprehensive logging"""
        logger.info("THREAD_SHUTDOWN: Starting ThreadManager shutdown...")
        thread_monitor.log_active_threads()

        # Signal shutdown to all threads
        self.shutdown_event.set()

        # Shutdown the thread pool executor with very short timeout
        if self.executor:
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
                    thread.join(timeout=0.5)  # Very short timeout
                    if thread.is_alive():
                        logger.warning(f"THREAD_SHUTDOWN: Thread {thread_id} did not complete")

        logger.info("THREAD_SHUTDOWN: ThreadManager shutdown completed")
        thread_monitor.log_active_threads()

# Global thread manager instance with sync mode for Docker
thread_manager = ThreadManager(max_workers=1)

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

def force_ssh_thread_cleanup():
    """Force cleanup of SSH threads"""
    thread_manager.force_cleanup_ssh_threads()

def safe_start_thread(target_func: Callable, thread_name: str, *args, **kwargs) -> bool:
    """
    Global function to safely start threads - replaces direct threading.Thread().start()
    This should be used instead of creating threads directly in app.py
    """
    return thread_manager.safe_thread_start(target_func, thread_name, *args, **kwargs)
