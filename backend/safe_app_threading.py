
"""
Safe threading integration for app.py
This module provides replacement functions for direct threading.Thread().start() calls
"""

import logging
from backend.app_threading import start_operation_thread

logger = logging.getLogger('fix_deployment_orchestrator')

def safe_start_file_deployment(process_func, deployment_id):
    """
    Safe replacement for: threading.Thread(target=process_file_deployment, args=(deployment_id,)).start()
    """
    logger.info(f"SAFE_THREADING: Starting file deployment thread for {deployment_id}")
    return start_operation_thread(process_func, f"file-deployment-{deployment_id}", deployment_id)

def safe_start_sql_deployment(process_func, deployment_id):
    """
    Safe replacement for: threading.Thread(target=process_sql_deployment, args=(deployment_id,)).start()
    """
    logger.info(f"SAFE_THREADING: Starting SQL deployment thread for {deployment_id}")
    return start_operation_thread(process_func, f"sql-deployment-{deployment_id}", deployment_id)

def safe_start_systemd_operation(process_func, deployment_id, operation, service, vms):
    """
    Safe replacement for: threading.Thread(target=process_systemd_operation, args=(deployment_id, operation, service, vms)).start()
    """
    logger.info(f"SAFE_THREADING: Starting systemd operation thread for {deployment_id}")
    return start_operation_thread(process_func, f"systemd-{deployment_id}", deployment_id, operation, service, vms)

def safe_start_command_deployment(process_func, deployment_id):
    """
    Safe replacement for: threading.Thread(target=process_command_deployment, args=(deployment_id,)).start()
    """
    logger.info(f"SAFE_THREADING: Starting command deployment thread for {deployment_id}")
    return start_operation_thread(process_func, f"command-deployment-{deployment_id}", deployment_id)

def safe_start_rollback_deployment(process_func, rollback_id):
    """
    Safe replacement for: threading.Thread(target=process_rollback_deployment, args=(deployment_id,)).start()
    """
    logger.info(f"SAFE_THREADING: Starting rollback deployment thread for {rollback_id}")
    return start_operation_thread(process_func, f"rollback-deployment-{rollback_id}", rollback_id)

# Generic safe thread starter for any function
def safe_start_thread(target_func, thread_name, *args, **kwargs):
    """
    Generic safe thread starter - replacement for threading.Thread(target=func, args=args).start()
    """
    logger.info(f"SAFE_THREADING: Starting generic thread {thread_name}")
    return start_operation_thread(target_func, thread_name, *args, **kwargs)
