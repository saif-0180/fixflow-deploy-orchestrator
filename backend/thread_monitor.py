
import threading
import time
import logging
import psutil
import os
from typing import Dict, List

logger = logging.getLogger('fix_deployment_orchestrator')

class ThreadMonitor:
    """
    Monitor and debug threading behavior in the application
    """
    
    def __init__(self):
        self.start_time = time.time()
        self.thread_history: List[Dict] = []
        self.max_threads_seen = 0
        self._lock = threading.Lock()
        
    def log_thread_creation(self, thread_name: str, thread_type: str = "unknown"):
        """Log when a new thread is created"""
        with self._lock:
            current_count = threading.active_count()
            
            # Update max threads seen
            if current_count > self.max_threads_seen:
                self.max_threads_seen = current_count
            
            thread_info = {
                "timestamp": time.time(),
                "thread_name": thread_name,
                "thread_type": thread_type,
                "active_count": current_count,
                "thread_id": threading.get_ident()
            }
            
            self.thread_history.append(thread_info)
            
            logger.info(f"THREAD_DEBUG: Created '{thread_name}' ({thread_type}) - "
                       f"Active threads: {current_count}, Max seen: {self.max_threads_seen}")
            
            # Log all active threads for debugging
            self.log_active_threads()
    
    def log_active_threads(self):
        """Log all currently active threads"""
        active_threads = threading.enumerate()
        logger.info(f"THREAD_DEBUG: Active threads ({len(active_threads)}):")
        
        for thread in active_threads:
            logger.info(f"  - {thread.name} (ID: {thread.ident}, "
                       f"Daemon: {thread.daemon}, Alive: {thread.is_alive()})")
    
    def log_system_resources(self):
        """Log system resource usage"""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            cpu_percent = process.cpu_percent()
            
            logger.info(f"SYSTEM_DEBUG: Memory: {memory_info.rss / 1024 / 1024:.1f}MB, "
                       f"CPU: {cpu_percent:.1f}%, Threads: {process.num_threads()}")
        except Exception as e:
            logger.warning(f"Could not get system info: {e}")
    
    def check_thread_limits(self) -> bool:
        """Check if we're approaching thread limits"""
        current_count = threading.active_count()
        
        # Check system limits
        try:
            import resource
            soft_limit, hard_limit = resource.getrlimit(resource.RLIMIT_NPROC)
            logger.info(f"THREAD_DEBUG: Process limits - Soft: {soft_limit}, Hard: {hard_limit}")
            
            if current_count > soft_limit * 0.8:  # 80% of limit
                logger.warning(f"THREAD_WARNING: Approaching thread limit! "
                              f"Current: {current_count}, Limit: {soft_limit}")
                return False
        except Exception as e:
            logger.warning(f"Could not check process limits: {e}")
        
        # Docker container typical limits
        if current_count > 50:
            logger.warning(f"THREAD_WARNING: High thread count: {current_count}")
            return False
            
        return True
    
    def get_thread_report(self) -> Dict:
        """Get comprehensive thread report"""
        with self._lock:
            return {
                "current_active": threading.active_count(),
                "max_seen": self.max_threads_seen,
                "history_count": len(self.thread_history),
                "uptime_seconds": time.time() - self.start_time,
                "recent_threads": self.thread_history[-10:] if self.thread_history else []
            }
    
    def emergency_thread_cleanup(self):
        """Emergency cleanup when thread count is too high"""
        logger.warning("THREAD_EMERGENCY: Performing emergency thread cleanup")
        
        active_threads = threading.enumerate()
        for thread in active_threads:
            if thread != threading.main_thread() and thread.daemon:
                logger.warning(f"THREAD_EMERGENCY: Found daemon thread: {thread.name}")
                # Don't force kill, just log for now

# Global thread monitor
thread_monitor = ThreadMonitor()

def monitor_thread_creation(thread_name: str, thread_type: str = "unknown"):
    """Decorator/function to monitor thread creation"""
    thread_monitor.log_thread_creation(thread_name, thread_type)
    return thread_monitor.check_thread_limits()

def log_app_startup():
    """Log application startup threading info"""
    logger.info("="*60)
    logger.info("APPLICATION STARTUP - THREADING DEBUG")
    logger.info("="*60)
    thread_monitor.log_active_threads()
    thread_monitor.log_system_resources()
    logger.info("="*60)
