
import os
import multiprocessing

# Ultra-conservative Gunicorn configuration - pure sync mode (no threading)
bind = "0.0.0.0:5000"
workers = 1  # Single worker only
worker_class = "sync"  # Sync worker class - single-threaded by design
worker_connections = 3  # Very limited connections per worker
timeout = 300
keepalive = 5
max_requests = 30  # Restart worker more frequently to prevent memory issues
max_requests_jitter = 5
preload_app = True

# Logging
accesslog = "/app/logs/gunicorn_access.log"
errorlog = "/app/logs/gunicorn_error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# NO THREADING - sync workers are single-threaded by default
# threads parameter is not used with sync worker class

def when_ready(server):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info("Gunicorn server ready with pure sync mode (no threading)")

def worker_int(worker):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info(f"Worker {worker.pid} interrupted")

def post_fork(server, worker):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info(f"Worker {worker.pid} forked - running in pure sync mode")
