
import os
import multiprocessing

# Ultra-conservative Gunicorn configuration for threading optimization
bind = "0.0.0.0:5000"
workers = 1  # Single worker to avoid thread multiplication
worker_class = "sync"  # Use sync worker instead of threaded
worker_connections = 5  # Very limited connections per worker
timeout = 300
keepalive = 5
max_requests = 50  # Restart worker more frequently
max_requests_jitter = 5
preload_app = True

# Logging
accesslog = "/app/logs/gunicorn_access.log"
errorlog = "/app/logs/gunicorn_error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# No threading in sync mode
# threads = 1  # Commented out for sync worker
# thread_timeout = 30  # Commented out for sync worker

def when_ready(server):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info("Gunicorn server ready with ultra-conservative threading limits")

def worker_int(worker):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info(f"Worker {worker.pid} interrupted")

def post_fork(server, worker):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info(f"Worker {worker.pid} forked")
