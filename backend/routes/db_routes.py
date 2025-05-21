
from flask import Blueprint, jsonify, request
import json
import os
import subprocess
import time
import uuid
import threading
import logging

# Get logger
logger = logging.getLogger('fix_deployment_orchestrator')

db_routes = Blueprint('db_routes', __name__)

# Deploy directory for logs
DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')

# Dictionary to store deployment information (same as in app.py)
deployments = {}

@db_routes.route('/api/db/connections', methods=['GET'])
def get_db_connections():
    try:
        # First try to read from inventory file
        inventory_path = os.path.join('inventory', 'db_inventory.json')
        if os.path.exists(inventory_path):
            with open(inventory_path, 'r') as f:
                inventory = json.load(f)
                return jsonify(inventory.get('db_connections', []))
        
        # Fallback to default values if inventory file not found
        return jsonify([
            {"hostname": "10.172.145.204", "port": "5400", "users": ["xpidbo1cfg", "abpwrk1db", "postgres"]},
            {"hostname": "10.172.145.205", "port": "5432", "users": ["postgres", "dbadmin"]}
        ])
    except Exception as e:
        logger.error(f"Error fetching DB connections: {str(e)}")
        return jsonify({"error": str(e)}), 500

@db_routes.route('/api/db/users', methods=['GET'])
def get_db_users():
    try:
        # First try to read from inventory file
        inventory_path = os.path.join('inventory', 'db_inventory.json')
        if os.path.exists(inventory_path):
            with open(inventory_path, 'r') as f:
                inventory = json.load(f)
                return jsonify(inventory.get('db_users', ["xpidbo1cfg", "postgres", "dbadmin"]))
        
        # Fallback to default values if inventory file not found
        return jsonify(["xpidbo1cfg", "postgres", "dbadmin"])
    except Exception as e:
        logger.error(f"Error fetching DB users: {str(e)}")
        return jsonify({"error": str(e)}), 500

@db_routes.route('/api/deploy/sql', methods=['POST'])
def deploy_sql():
    data = request.json
    ft = data.get('ft')
    file_name = data.get('file')
    hostname = data.get('hostname')
    port = data.get('port')
    db_name = data.get('dbName')
    user = data.get('user')
    password = data.get('password', '')
    
    logger.info(f"SQL deployment request received: {file_name} from FT {ft} on {hostname}:{port}")
    
    if not all([ft, file_name, hostname, port, db_name, user]):
        logger.error("Missing required parameters for SQL deployment")
        return jsonify({"error": "Missing required parameters"}), 400
    
    # Generate a unique deployment ID
    deployment_id = str(uuid.uuid4())
    
    # Store deployment information
    deployments[deployment_id] = {
        "id": deployment_id,
        "type": "sql",
        "ft": ft,
        "file": file_name,
        "hostname": hostname,
        "port": port,
        "db_name": db_name,
        "user": user,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Function to save deployment history from app.py
    from app import save_deployment_history
    save_deployment_history()
    
    # Start deployment in a separate thread
    threading.Thread(target=process_sql_deployment, args=(deployment_id, password)).start()
    
    logger.info(f"SQL deployment initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_sql_deployment(deployment_id, password):
    from app import log_message, deployments, save_deployment_history
    
    deployment = deployments[deployment_id]
    
    try:
        ft = deployment["ft"]
        file_name = deployment["file"]
        hostname = deployment["hostname"]
        port = deployment["port"]
        db_name = deployment["db_name"]
        user = deployment["user"]
        
        source_file = os.path.join('/app/fixfiles', 'AllFts', ft, file_name)
        logger.info(f"Processing SQL deployment from {source_file}")
        
        if not os.path.exists(source_file):
            error_msg = f"Source file not found: {source_file}"
            log_message(deployment_id, f"ERROR: {error_msg}")
            deployments[deployment_id]["status"] = "failed"
            logger.error(error_msg)
            save_deployment_history()
            return
        
        log_message(deployment_id, f"Starting SQL deployment for {file_name} on {hostname}:{port}/{db_name}")
        
        # Create command using psql
        cmd = ["psql", "-h", hostname, "-p", port, "-d", db_name, "-U", user, "-f", source_file]
        env = os.environ.copy()
        
        # Set password in environment if provided
        if password:
            env["PGPASSWORD"] = password
        
        log_message(deployment_id, f"Executing: psql -h {hostname} -p {port} -d {db_name} -U {user} -f {file_name}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        
        for line in process.stdout:
            line_stripped = line.strip()
            log_message(deployment_id, line_stripped)
            # Also log to main application log
            logger.debug(f"[{deployment_id}] {line_stripped}")
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: SQL execution completed successfully")
            deployments[deployment_id]["status"] = "success"
            logger.info(f"SQL deployment {deployment_id} completed successfully")
        else:
            log_message(deployment_id, "ERROR: SQL execution failed")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"SQL deployment {deployment_id} failed with return code {process.returncode}")
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during SQL deployment: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in SQL deployment {deployment_id}: {str(e)}")
        save_deployment_history()
