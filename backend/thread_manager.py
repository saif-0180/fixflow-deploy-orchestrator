
import logging
import threading
import time
import uuid
from concurrent.futures import Future
from typing import Dict, Callable, Any, Optional
from backend.config import ProductionThreadingConfig
import os

logger = logging.getLogger('fix_deployment_orchestrator.thread_manager')

class ProductionThreadManager:
    """Production-grade thread manager optimized for Gunicorn deployment"""
    
    def __init__(self):
        self.active_tasks: Dict[str, Future] = {}
        self.task_lock = threading.Lock()
        self.worker_pid = os.getpid()
        self.worker_name = f"worker_{self.worker_pid}"
        
        logger.info(f"Initialized ProductionThreadManager for {self.worker_name}")
        
    def submit_task(self, task_func: Callable, task_id: str, *args, **kwargs) -> str:
        """Submit a task to the production thread pool with monitoring"""
        try:
            logger.info(f"[{self.worker_name}] Submitting task {task_id} to thread pool")
            logger.debug(f"Current thread info: {ProductionThreadingConfig.get_thread_info()}")
            
            executor = ProductionThreadingConfig.get_executor()
            future = executor.submit(self._task_wrapper, task_func, task_id, *args, **kwargs)
            
            with self.task_lock:
                self.active_tasks[task_id] = future
                
            logger.info(f"[{self.worker_name}] Task {task_id} submitted successfully. Active tasks: {len(self.active_tasks)}")
            return task_id
            
        except Exception as e:
            logger.error(f"[{self.worker_name}] Failed to submit task {task_id}: {str(e)}")
            logger.exception("Task submission error details:")
            raise
    
    def _task_wrapper(self, task_func: Callable, task_id: str, *args, **kwargs):
        """Production wrapper for tasks with comprehensive error handling"""
        start_time = time.time()
        thread_name = threading.current_thread().name
        
        try:
            logger.info(f"[{self.worker_name}] Starting task {task_id} in thread {thread_name}")
            result = task_func(task_id, *args, **kwargs)
            
            execution_time = time.time() - start_time
            logger.info(f"[{self.worker_name}] Task {task_id} completed successfully in {execution_time:.2f}s")
            return result
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"[{self.worker_name}] Task {task_id} failed after {execution_time:.2f}s with error: {str(e)}")
            logger.exception(f"Task {task_id} error details:")
            raise
            
        finally:
            # Clean up task from active tasks
            with self.task_lock:
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
            
            final_time = time.time() - start_time
            logger.debug(f"[{self.worker_name}] Task {task_id} cleaned up after {final_time:.2f}s. Remaining active tasks: {len(self.active_tasks)}")
    
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
                logger.info(f"[{self.worker_name}] Task {task_id} cancellation {'successful' if cancelled else 'failed'}")
                return cancelled
        return False
    
    def get_active_tasks_count(self) -> int:
        """Get count of active tasks"""
        with self.task_lock:
            return len(self.active_tasks)
    
    def get_thread_status(self) -> Dict[str, Any]:
        """Get comprehensive thread status for production monitoring"""
        thread_info = ProductionThreadingConfig.get_thread_info()
        
        with self.task_lock:
            active_task_ids = list(self.active_tasks.keys())
            
        status = {
            'worker_info': {
                'worker_pid': self.worker_pid,
                'worker_name': self.worker_name,
                'gunicorn_worker_class': os.environ.get('GUNICORN_WORKER_CLASS', 'sync')
            },
            'thread_info': thread_info,
            'active_tasks_count': len(active_task_ids),
            'active_task_ids': active_task_ids,
            'timestamp': time.time()
        }
        
        logger.debug(f"[{self.worker_name}] Thread status: {status}")
        return status
    
    def shutdown_gracefully(self):
        """Gracefully shutdown the thread manager"""
        logger.info(f"[{self.worker_name}] Shutting down thread manager gracefully")
        
        with self.task_lock:
            active_count = len(self.active_tasks)
            if active_count > 0:
                logger.info(f"[{self.worker_name}] Waiting for {active_count} active tasks to complete")
                
                # Wait for tasks to complete (with timeout)
                for task_id, future in self.active_tasks.items():
                    try:
                        future.result(timeout=30)  # 30 second timeout per task
                        logger.info(f"[{self.worker_name}] Task {task_id} completed during shutdown")
                    except Exception as e:
                        logger.warning(f"[{self.worker_name}] Task {task_id} failed during shutdown: {str(e)}")
        
        # Shutdown the thread pool
        ProductionThreadingConfig.shutdown_executor()
        logger.info(f"[{self.worker_name}] Thread manager shutdown complete")

# Global production thread manager instance
thread_manager = ProductionThreadManager()

# Backward compatibility functions
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
