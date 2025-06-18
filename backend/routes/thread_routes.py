
from flask import Blueprint, jsonify
import logging
from backend.thread_manager import get_system_thread_status, thread_manager
from backend.config import ThreadingConfig

logger = logging.getLogger('fix_deployment_orchestrator.thread_routes')

thread_routes = Blueprint('thread_routes', __name__)

@thread_routes.route('/api/system/threads', methods=['GET'])
def get_thread_status():
    """Get current thread status for debugging"""
    try:
        logger.debug("Fetching thread status")
        status = get_system_thread_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Error fetching thread status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@thread_routes.route('/api/system/health', methods=['GET'])
def health_check():
    """Health check endpoint with threading information"""
    try:
        thread_info = ThreadingConfig.get_thread_info()
        active_tasks = thread_manager.get_active_tasks_count()
        
        health_status = {
            "status": "healthy",
            "threading": {
                "active_threads": thread_info['active_threads'],
                "max_workers": thread_info['max_workers'],
                "executor_status": thread_info['executor_status'],
                "active_deployment_tasks": active_tasks
            },
            "timestamp": thread_info.get('timestamp', 'unknown')
        }
        
        logger.debug(f"Health check response: {health_status}")
        return jsonify(health_status)
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500
