
"""
WSGI entry point for production deployment with Gunicorn
"""
import os
import sys
import logging
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Import application components
from app import create_app
from config import ProductionConfig
from startup_check import perform_startup_checks

# Setup production logging
ProductionConfig.setup_production_logging()
logger = logging.getLogger('fix_deployment_orchestrator.wsgi')

def create_production_app():
    """Create the Flask application for production"""
    try:
        logger.info("Creating production Flask application")
        
        # Perform startup checks
        startup_success = perform_startup_checks()
        if not startup_success:
            logger.warning("Some startup checks failed, but continuing with application creation")
        
        # Create Flask app
        app = create_app()
        
        # Configure for production
        app.config.from_object(ProductionConfig)
        
        logger.info("Production Flask application created successfully")
        return app
        
    except Exception as e:
        logger.error(f"Failed to create production application: {str(e)}")
        logger.exception("Production application creation error details:")
        raise

# Create the application instance
application = create_production_app()
app = application  # Gunicorn looks for 'app' by default

if __name__ == "__main__":
    # This is for development/testing only
    logger.info("Running in development mode")
    application.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
