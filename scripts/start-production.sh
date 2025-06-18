
#!/bin/bash

# Production startup script for Fix Deployment Orchestrator

set -e

echo "Starting Fix Deployment Orchestrator in Production Mode"
echo "======================================================="

# Set production environment variables
export FLASK_ENV=production
export GUNICORN_WORKERS=${GUNICORN_WORKERS:-4}
export GUNICORN_WORKER_CLASS=${GUNICORN_WORKER_CLASS:-gevent}
export GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT:-30}

# Ensure log directory exists
mkdir -p /app/logs

# Health check function
health_check() {
    echo "Performing health check..."
    for i in {1..30}; do
        if curl -f http://localhost:5000/api/system/health >/dev/null 2>&1; then
            echo "✓ Application is healthy"
            return 0
        fi
        echo "Waiting for application to start... ($i/30)"
        sleep 2
    done
    echo "✗ Health check failed"
    return 1
}

# Start Gunicorn
echo "Starting Gunicorn with configuration:"
echo "  Workers: $GUNICORN_WORKERS"
echo "  Worker Class: $GUNICORN_WORKER_CLASS"
echo "  Timeout: $GUNICORN_TIMEOUT"
echo "  Bind: 0.0.0.0:5000"

# Start the application
exec gunicorn \
    --config backend/gunicorn.conf.py \
    --bind 0.0.0.0:5000 \
    --workers $GUNICORN_WORKERS \
    --worker-class $GUNICORN_WORKER_CLASS \
    --timeout $GUNICORN_TIMEOUT \
    --preload \
    --log-level info \
    --access-logfile /app/logs/gunicorn_access.log \
    --error-logfile /app/logs/gunicorn_error.log \
    backend.wsgi:application
