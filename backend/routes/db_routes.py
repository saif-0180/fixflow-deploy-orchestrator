
from flask import current_app, Blueprint, jsonify, request
import json
import os
import subprocess
import time
import uuid
import logging
from backend.thread_manager import thread_manager

# Get logger
logger = logging.getLogger('fix_deployment_orchestrator')

db_routes = Blueprint('db_routes', __name__)

# Deploy directory for logs
DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')

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
    # Import here to avoid circular imports and ensure we get the shared instance
    from app import deployments, save_deployment_history
    
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
    
    # Store deployment information in the shared deployments dictionary
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
    
    # Save deployment history
    save_deployment_history()
    
    # Use thread manager to start deployment
    thread_manager.submit_deployment_task(
        process_sql_deployment, 
        deployment_id,
        password
    )
    
    logger.info(f"SQL deployment initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_sql_deployment(deployment_id, password):
    """
    Process SQL deployment in a managed thread
    This function is now called by the thread manager
    """
    # Import here to ensure we get the shared instances
    from app import log_message, deployments, save_deployment_history
    
    try:
        # Check if deployment exists
        if deployment_id not in deployments:
            thread_manager.log_thread_safe(f"Deployment ID {deployment_id} not found in deployments dictionary", "error")
            return
        
        deployment = deployments[deployment_id]
        
        ft = deployment["ft"]
        file_name = deployment["file"]
        hostname = deployment["hostname"]
        port = deployment["port"]
        db_name = deployment["db_name"]
        user = deployment["user"]
        
        source_file = os.path.join('/app/fixfiles', 'AllFts', ft, file_name)
        thread_manager.log_thread_safe(f"Processing SQL deployment from {source_file}")
        
        if not os.path.exists(source_file):
            error_msg = f"Source file not found: {source_file}"
            log_message(deployment_id, f"ERROR: {error_msg}")
            thread_manager.log_thread_safe(error_msg, "error")
            
            # Update deployment status to failed
            if deployment_id in deployments:
                deployments[deployment_id]["status"] = "failed"
                save_deployment_history()
            return
        
        log_message(deployment_id, f"Starting SQL deployment for {file_name} on {hostname}:{port}/{db_name}")
        
        # Check if psql is available
        psql_check = subprocess.run(["which", "psql"], capture_output=True, text=True)
        if psql_check.returncode != 0:
            error_msg = "psql command not found. PostgreSQL client tools are not installed."
            log_message(deployment_id, f"ERROR: {error_msg}")
            log_message(deployment_id, "SUGGESTION: Install postgresql-client package in the container")
            thread_manager.log_thread_safe(error_msg, "error")
            
            # Update deployment status to failed
            if deployment_id in deployments:
                deployments[deployment_id]["status"] = "failed"
                save_deployment_history()
            return
        
        # Create command using psql
        cmd = ["psql", "-h", hostname, "-p", port, "-d", db_name, "-U", user, "-f", source_file]
        env = os.environ.copy()
        
        # Set password in environment if provided
        if password:
            env["PGPASSWORD"] = password
        
        log_message(deployment_id, f"Executing: psql -h {hostname} -p {port} -d {db_name} -U {user} -f {file_name}")
        
        try:
            # Use subprocess.run for better control and to capture both stdout and stderr
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                env=env,
                timeout=300  # 5 minute timeout
            )
            
            has_errors = False
            has_warnings = False
            
            # Process and log all output (stdout and stderr combined)
            all_output = ""
            if result.stdout:
                all_output += result.stdout
            if result.stderr:
                all_output += result.stderr
            
            if all_output:
                for line in all_output.strip().split('\n'):
                    line_stripped = line.strip()
                    if line_stripped:
                        # Check for SQL errors in the output
                        if "ERROR:" in line_stripped.upper():
                            has_errors = True
                            log_message(deployment_id, line_stripped)
                            thread_manager.log_thread_safe(f"[{deployment_id}] {line_stripped}", "error")
                        elif "WARNING:" in line_stripped.upper():
                            has_warnings = True
                            log_message(deployment_id, line_stripped)
                            thread_manager.log_thread_safe(f"[{deployment_id}] {line_stripped}", "warning")
                        else:
                            log_message(deployment_id, line_stripped)
                            thread_manager.log_thread_safe(f"[{deployment_id}] {line_stripped}")
            
            # Determine final status based on errors found in output, not just return code
            if has_errors or result.returncode != 0:
                log_message(deployment_id, "FAILED: SQL execution completed with errors")
                if deployment_id in deployments:
                    deployments[deployment_id]["status"] = "failed"
                thread_manager.log_thread_safe(f"SQL deployment {deployment_id} failed - errors detected in output or non-zero return code", "error")
            elif has_warnings:
                log_message(deployment_id, "WARNING: SQL execution completed with warnings")
                if deployment_id in deployments:
                    deployments[deployment_id]["status"] = "success"  # Still success but with warnings
                thread_manager.log_thread_safe(f"SQL deployment {deployment_id} completed with warnings", "warning")
            else:
                log_message(deployment_id, "SUCCESS: SQL execution completed successfully")
                if deployment_id in deployments:
                    deployments[deployment_id]["status"] = "success"
                thread_manager.log_thread_safe(f"SQL deployment {deployment_id} completed successfully")
            
        except subprocess.TimeoutExpired:
            error_msg = "SQL execution timed out after 5 minutes"
            log_message(deployment_id, f"ERROR: {error_msg}")
            if deployment_id in deployments:
                deployments[deployment_id]["status"] = "failed"
            thread_manager.log_thread_safe(f"SQL deployment {deployment_id} timed out", "error")
            
        except subprocess.SubprocessError as e:
            error_msg = f"Subprocess error during SQL execution: {str(e)}"
            log_message(deployment_id, f"ERROR: {error_msg}")
            if deployment_id in deployments:
                deployments[deployment_id]["status"] = "failed"
            thread_manager.log_thread_safe(error_msg, "error")
        
        # Always save deployment history after processing
        save_deployment_history()
        
    except FileNotFoundError as e:
        # Handle case where psql command is not found
        error_msg = f"PostgreSQL client (psql) not found: {str(e)}"
        log_message(deployment_id, f"ERROR: {error_msg}")
        log_message(deployment_id, "SOLUTION: Install PostgreSQL client tools in the container")
        log_message(deployment_id, "Command: apt-get update && apt-get install -y postgresql-client")
        thread_manager.log_thread_safe(f"FileNotFoundError in SQL deployment {deployment_id}: {str(e)}", "error")
        
        if deployment_id in deployments:
            deployments[deployment_id]["status"] = "failed"
            save_deployment_history()
        
    except KeyError as e:
        error_msg = f"KeyError in SQL deployment thread: missing key {str(e)}"
        log_message(deployment_id, f"ERROR: {error_msg}")
        thread_manager.log_thread_safe(f"KeyError in SQL deployment thread for {deployment_id}: {str(e)}", "error")
        
        if deployment_id in deployments:
            deployments[deployment_id]["status"] = "failed"
            save_deployment_history()
        
    except Exception as e:
        # Catch-all for any other exceptions
        error_msg = f"Unexpected error during SQL deployment: {str(e)}"
        log_message(deployment_id, f"ERROR: {error_msg}")
        thread_manager.log_thread_safe(f"Exception in SQL deployment {deployment_id}: {str(e)}", "error")
        
        if deployment_id in deployments:
            deployments[deployment_id]["status"] = "failed"
            save_deployment_history()
