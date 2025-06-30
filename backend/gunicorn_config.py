
import os
import multiprocessing

# Gunicorn configuration for threading optimization
bind = "0.0.0.0:5000"
workers = 1  # Single worker to avoid thread multiplication
worker_class = "sync"  # Use sync worker instead of threaded
worker_connections = 10  # Limit connections per worker
timeout = 300
keepalive = 5
max_requests = 100
max_requests_jitter = 10
preload_app = True

# Logging
accesslog = "/app/logs/gunicorn_access.log"
errorlog = "/app/logs/gunicorn_error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Threading limits
threads = 2  # Minimal threading
thread_timeout = 60

def when_ready(server):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info("Gunicorn server ready with threading limits")

def worker_int(worker):
    import logging
    logger = logging.getLogger('gunicorn.error')
    logger.info(f"Worker {worker.pid} interrupted")
