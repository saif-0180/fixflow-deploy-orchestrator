
from flask import Flask, request, jsonify, send_from_directory, Response
import os
import json
import subprocess
import time
import uuid
import threading
import logging
from logging.handlers import RotatingFileHandler
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='../frontend/dist')

# Directory where fix files are stored
FIX_FILES_DIR = os.environ.get('FIX_FILES_DIR', '/app/fixfiles')

# Directory for deployment logs
DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')
APP_LOG_FILE = os.environ.get('APP_LOG_FILE', '/app/logs/application.log')

# Create logs directory if it doesn't exist
os.makedirs(DEPLOYMENT_LOGS_DIR, exist_ok=True)

# Configure application logging
logger = logging.getLogger('fix_deployment_orchestrator')
logger.setLevel(logging.DEBUG)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_format)

# File handler (with rotation)
file_handler = RotatingFileHandler(APP_LOG_FILE, maxBytes=10485760, backupCount=10) # 10MB per file, keep 10 files
file_handler.setLevel(logging.DEBUG)
file_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_format)

# Add handlers
logger.addHandler(console_handler)
logger.addHandler(file_handler)

# Dictionary to store deployment information
deployments = {}

# Try to load previous deployments if they exist
DEPLOYMENTS_HISTORY_FILE = os.path.join(DEPLOYMENT_LOGS_DIR, 'deployment_history.json')
try:
    if os.path.exists(DEPLOYMENTS_HISTORY_FILE):
        with open(DEPLOYMENTS_HISTORY_FILE, 'r') as f:
            deployments = json.load(f)
        logger.info(f"Loaded {len(deployments)} previous deployments from history file")
except Exception as e:
    logger.error(f"Failed to load deployment history: {str(e)}")

# Load inventory from file or create a default one
INVENTORY_FILE = os.environ.get('INVENTORY_FILE', '/app/inventory/inventory.json')
os.makedirs(os.path.dirname(INVENTORY_FILE), exist_ok=True)

try:
    with open(INVENTORY_FILE, 'r') as f:
        inventory = json.load(f)
    logger.info(f"Loaded inventory with {len(inventory.get('vms', []))} VMs")
except (FileNotFoundError, json.JSONDecodeError):
    # Default inventory structure
    inventory = {
        "vms": [
            {"name": "batch1", "type": "batch", "ip": "192.168.1.10"},
            {"name": "batch2", "type": "batch", "ip": "192.168.1.11"},
            {"name": "imdg1", "type": "imdg", "ip": "192.168.1.20"},
            {"name": "imdg2", "type": "imdg", "ip": "192.168.1.21"},
            # More VMs...
        ],
        "users": ["infadm", "abpwrk1"],
        "db_users": ["postgres", "dbadmin"],
        "systemd_services": ["hazelcast", "kafka", "zookeeper", "airflow-scheduler"]
    }
    with open(INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f)
    logger.info("Created default inventory configuration")

# Function to save inventory
def save_inventory():
    with open(INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f)
    logger.info("Saved inventory configuration")

# Function to save deployment history
def save_deployment_history():
    try:
        with open(DEPLOYMENTS_HISTORY_FILE, 'w') as f:
            json.dump(deployments, f)
        logger.info(f"Saved {len(deployments)} deployments to history file")
    except Exception as e:
        logger.error(f"Failed to save deployment history: {str(e)}")

# Serve React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    logger.debug(f"Serving static path: {path}")
    if path and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

# API to get all FTs
@app.route('/api/fts')
def get_fts():
    ft_type = request.args.get('type', None)
    logger.info(f"Getting FTs with type filter: {ft_type}")
    
    all_fts = []
    fts_dir = os.path.join(FIX_FILES_DIR, 'AllFts')
    
    if os.path.exists(fts_dir):
        all_fts = [d for d in os.listdir(fts_dir) if os.path.isdir(os.path.join(fts_dir, d))]
        logger.debug(f"Found {len(all_fts)} FTs in directory")
    else:
        logger.warning(f"FTs directory does not exist: {fts_dir}")
    
    if ft_type == 'sql':
        # Filter FTs that have SQL files
        filtered_fts = []
        for ft in all_fts:
            ft_dir = os.path.join(fts_dir, ft)
            if any(f.endswith('.sql') for f in os.listdir(ft_dir)):
                filtered_fts.append(ft)
        logger.debug(f"Filtered to {len(filtered_fts)} SQL FTs")
        return jsonify(filtered_fts)
    
    return jsonify(all_fts)

# API to get files for an FT
@app.route('/api/fts/<ft>/files')
def get_ft_files(ft):
    ft_type = request.args.get('type', None)
    logger.info(f"Getting files for FT: {ft} with type filter: {ft_type}")
    
    ft_dir = os.path.join(FIX_FILES_DIR, 'AllFts', ft)
    
    if not os.path.exists(ft_dir):
        logger.warning(f"FT directory does not exist: {ft_dir}")
        return jsonify([])
    
    if ft_type == 'sql':
        # Return only SQL files
        sql_files = [f for f in os.listdir(ft_dir) if f.endswith('.sql')]
        logger.debug(f"Found {len(sql_files)} SQL files in FT: {ft}")
        return jsonify(sql_files)
    
    # Return all files
    files = [f for f in os.listdir(ft_dir) if os.path.isfile(os.path.join(ft_dir, f))]
    logger.debug(f"Found {len(files)} files in FT: {ft}")
    return jsonify(files)

# API to get VMs
@app.route('/api/vms')
def get_vms():
    logger.info("Getting list of VMs")
    return jsonify(inventory["vms"])

# API to get DB users
@app.route('/api/db/users')
def get_db_users():
    logger.info("Getting list of DB users")
    return jsonify(inventory["db_users"])

# API to get systemd services
@app.route('/api/systemd/services')
def get_systemd_services():
    logger.info("Getting list of systemd services")
    return jsonify(inventory["systemd_services"])

# API to deploy a file
@app.route('/api/deploy/file', methods=['POST'])
def deploy_file():
    data = request.json
    ft = data.get('ft')
    file_name = data.get('file')
    user = data.get('user')
    target_path = data.get('targetPath')
    vms = data.get('vms')
    sudo = data.get('sudo', False)
    
    logger.info(f"File deployment request received: {file_name} from FT {ft} to {len(vms)} VMs")
    
    if not all([ft, file_name, user, target_path, vms]):
        logger.error("Missing required parameters for file deployment")
        return jsonify({"error": "Missing required parameters"}), 400
    
    # Generate a unique deployment ID
    deployment_id = str(uuid.uuid4())
    
    # Store deployment information
    deployments[deployment_id] = {
        "id": deployment_id,
        "type": "file",
        "ft": ft,
        "file": file_name,
        "user": user,
        "target_path": target_path,
        "vms": vms,
        "sudo": sudo,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start deployment in a separate thread
    threading.Thread(target=process_file_deployment, args=(deployment_id,)).start()
    
    logger.info(f"File deployment initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_file_deployment(deployment_id):
    deployment = deployments[deployment_id]
    
    try:
        ft = deployment["ft"]
        file_name = deployment["file"]
        user = deployment["user"]
        target_path = deployment["target_path"]
        vms = deployment["vms"]
        sudo = deployment["sudo"]
        
        source_file = os.path.join(FIX_FILES_DIR, 'AllFts', ft, file_name)
        logger.info(f"Processing file deployment from {source_file}")
        
        if not os.path.exists(source_file):
            error_msg = f"Source file not found: {source_file}"
            log_message(deployment_id, f"ERROR: {error_msg}")
            deployments[deployment_id]["status"] = "failed"
            logger.error(error_msg)
            save_deployment_history()
            return
        
        log_message(deployment_id, f"Starting file deployment for {file_name} to {len(vms)} VMs")
        
        # Generate an ansible playbook for file deployment
        playbook_file = f"/tmp/file_deploy_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Deploy file to VMs
  hosts: deployment_targets
  gather_facts: false
  become: {"true" if sudo else "false"}
  become_user: {user}
  tasks:
    - name: Create target directory if it does not exist
      ansible.builtin.file:
        path: "{os.path.dirname(target_path)}"
        state: directory
        mode: '0755'
      
    - name: Copy file to target VMs
      ansible.builtin.copy:
        src: "{source_file}"
        dest: "{os.path.join(target_path, file_name)}"
        mode: '0644'
        owner: "{user}"
      register: copy_result
      
    - name: Log copy result
      ansible.builtin.debug:
        msg: "File copied successfully to {{ inventory_hostname }}"
      when: copy_result.changed
""")
        logger.debug(f"Created Ansible playbook: {playbook_file}")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[deployment_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        logger.debug(f"Created Ansible inventory: {inventory_file}")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: File deployment completed successfully")
            deployments[deployment_id]["status"] = "success"
            logger.info(f"File deployment {deployment_id} completed successfully")
        else:
            log_message(deployment_id, "ERROR: File deployment failed")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"File deployment {deployment_id} failed with return code {process.returncode}")
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during file deployment: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in file deployment {deployment_id}: {str(e)}")
        save_deployment_history()

# API to validate file deployment
@app.route('/api/deploy/<deployment_id>/validate', methods=['POST'])
def validate_deployment(deployment_id):
    logger.info(f"Validating deployment with ID: {deployment_id}")
    
    if deployment_id not in deployments:
        logger.error(f"Deployment not found with ID: {deployment_id}")
        return jsonify({"error": "Deployment not found"}), 404
    
    deployment = deployments[deployment_id]
    
    if deployment["type"] != "file":
        logger.error(f"Cannot validate non-file deployment type: {deployment['type']}")
        return jsonify({"error": "Only file deployments can be validated"}), 400
    
    vms = deployment["vms"]
    target_path = os.path.join(deployment["target_path"], deployment["file"])
    
    log_message(deployment_id, f"Starting validation for file {deployment['file']} on {len(vms)} VMs")
    
    results = []
    
    for vm_name in vms:
        # Find VM IP from inventory
        vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
        if not vm:
            log_message(deployment_id, f"ERROR: VM {vm_name} not found in inventory")
            results.append({
                "vm": vm_name,
                "status": "ERROR: VM not found"
            })
            continue
        
        # Run checksum command on remote VM
        cmd = ["ssh", f"infadm@{vm['ip']}", f"cksum {target_path}"]
        
        try:
            log_message(deployment_id, f"Running cksum on {vm_name}")
            output = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
            
            log_message(deployment_id, f"Validation on {vm_name}: {output}")
            results.append({
                "vm": vm_name,
                "status": "SUCCESS",
                "output": output
            })
        except subprocess.CalledProcessError as e:
            error = e.output.decode().strip()
            log_message(deployment_id, f"Validation failed on {vm_name}: {error}")
            results.append({
                "vm": vm_name,
                "status": "ERROR",
                "output": error
            })
    
    logger.info(f"Validation completed for deployment {deployment_id} with {len(results)} results")
    return jsonify({"results": results})

# API to run shell command
@app.route('/api/command/shell', methods=['POST'])
def run_shell_command():
    data = request.json
    command = data.get('command')
    vms = data.get('vms')
    sudo = data.get('sudo', False)
    user = data.get('user', 'infadm')
    
    logger.info(f"Shell command request received: '{command}' on {len(vms)} VMs")
    
    if not all([command, vms]):
        logger.error("Missing required parameters for shell command")
        return jsonify({"error": "Missing required parameters"}), 400
    
    # Generate a unique deployment ID
    deployment_id = str(uuid.uuid4())
    
    # Store deployment information
    deployments[deployment_id] = {
        "id": deployment_id,
        "type": "command",
        "command": command,
        "vms": vms,
        "sudo": sudo,
        "user": user,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start command execution in a separate thread
    threading.Thread(target=process_shell_command, args=(deployment_id,)).start()
    
    logger.info(f"Shell command initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_shell_command(deployment_id):
    deployment = deployments[deployment_id]
    
    try:
        command = deployment["command"]
        vms = deployment["vms"]
        sudo = deployment["sudo"]
        user = deployment.get("user", "infadm")
        
        log_message(deployment_id, f"Running command on {len(vms)} VMs: {command}")
        
        # Generate an ansible playbook for shell command
        playbook_file = f"/tmp/shell_command_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Run shell command on VMs
  hosts: command_targets
  gather_facts: false
  become: {"true" if sudo else "false"}
  become_user: {user}
  tasks:
    - name: Execute shell command
      ansible.builtin.shell: {command}
      register: command_result
      
    - name: Log command result
      ansible.builtin.debug:
        var: command_result.stdout_lines
""")
        logger.debug(f"Created Ansible playbook for shell command: {playbook_file}")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[command_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        logger.debug(f"Created Ansible inventory: {inventory_file}")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: Shell command executed successfully")
            deployments[deployment_id]["status"] = "success"
            logger.info(f"Shell command {deployment_id} completed successfully")
        else:
            log_message(deployment_id, "ERROR: Shell command execution failed")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"Shell command {deployment_id} failed with return code {process.returncode}")
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during shell command execution: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in shell command {deployment_id}: {str(e)}")
        save_deployment_history()

# API to deploy SQL file
@app.route('/api/deploy/sql', methods=['POST'])
def deploy_sql():
    data = request.json
    ft = data.get('ft')
    file_name = data.get('file')
    db_user = data.get('dbUser')
    db_password = data.get('dbPassword')
    
    logger.info(f"SQL deployment request received: {file_name} from FT {ft}")
    
    if not all([ft, file_name, db_user, db_password]):
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
        "db_user": db_user,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start SQL deployment in a separate thread
    threading.Thread(target=process_sql_deployment, args=(deployment_id, db_password)).start()
    
    logger.info(f"SQL deployment initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_sql_deployment(deployment_id, db_password):
    deployment = deployments[deployment_id]
    
    try:
        ft = deployment["ft"]
        file_name = deployment["file"]
        db_user = deployment["db_user"]
        
        source_file = os.path.join(FIX_FILES_DIR, 'AllFts', ft, file_name)
        
        if not os.path.exists(source_file):
            log_message(deployment_id, f"ERROR: SQL file not found: {source_file}")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"SQL file not found: {source_file}")
            save_deployment_history()
            return
        
        log_message(deployment_id, f"Starting SQL deployment for {file_name}")
        
        # Execute SQL file using psql
        # Note: In a production environment, you should use a more secure approach for handling passwords
        cmd = ["psql", "-U", db_user, "-h", "localhost", "-f", source_file]
        
        log_message(deployment_id, f"Executing SQL: {' '.join(cmd)}")
        logger.info(f"Executing SQL with command: {' '.join(cmd)}")
        
        # Set PGPASSWORD environment variable for psql
        env = os.environ.copy()
        env["PGPASSWORD"] = db_password
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: SQL deployment completed successfully")
            deployments[deployment_id]["status"] = "success"
            logger.info(f"SQL deployment {deployment_id} completed successfully")
        else:
            log_message(deployment_id, "ERROR: SQL deployment failed")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"SQL deployment {deployment_id} failed with return code {process.returncode}")
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during SQL deployment: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in SQL deployment {deployment_id}: {str(e)}")
        save_deployment_history()

# API for systemd operations
@app.route('/api/systemd/operation', methods=['POST'])
def systemd_operation():
    data = request.json
    service = data.get('service')
    operation = data.get('operation')
    vms = data.get('vms')
    
    logger.info(f"Systemd operation request received: {operation} {service} on {len(vms) if vms else 0} VMs")
    
    if not all([service, operation, vms]):
        logger.error("Missing required parameters for systemd operation")
        return jsonify({"error": "Missing required parameters"}), 400
    
    if operation not in ['status', 'start', 'stop', 'restart']:
        logger.error(f"Invalid systemd operation: {operation}")
        return jsonify({"error": "Invalid operation"}), 400
    
    # Generate a unique deployment ID
    deployment_id = str(uuid.uuid4())
    
    # Store deployment information
    deployments[deployment_id] = {
        "id": deployment_id,
        "type": "systemd",
        "service": service,
        "operation": operation,
        "vms": vms,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start systemd operation in a separate thread
    threading.Thread(target=process_systemd_operation, args=(deployment_id,)).start()
    
    logger.info(f"Systemd operation initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_systemd_operation(deployment_id):
    deployment = deployments[deployment_id]
    
    try:
        service = deployment["service"]
        operation = deployment["operation"]
        vms = deployment["vms"]
        
        log_message(deployment_id, f"Starting systemd {operation} for {service} on {len(vms)} VMs")
        
        # Generate an ansible playbook for systemd operation
        playbook_file = f"/tmp/systemd_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Perform systemd operation on VMs
  hosts: systemd_targets
  gather_facts: false
  become: true
  become_user: infadm
  tasks:
    - name: {operation.capitalize()} {service} service
      ansible.builtin.systemd:
        name: {service}
        state: {"started" if operation == 'start' else "stopped" if operation == 'stop' else "restarted" if operation == 'restart' else ""}
        {"enabled: true" if operation == 'start' else ""}
      when: '{operation}' != 'status'
      
    - name: Check {service} service status
      ansible.builtin.command: systemctl status {service}
      register: status_result
      changed_when: false
      ignore_errors: true
      
    - name: Log service status
      ansible.builtin.debug:
        var: status_result.stdout_lines
""")
        logger.debug(f"Created Ansible playbook for systemd operation: {playbook_file}")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[systemd_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        logger.debug(f"Created Ansible inventory: {inventory_file}")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, f"SUCCESS: Systemd {operation} operation completed successfully")
            deployments[deployment_id]["status"] = "success"
            logger.info(f"Systemd operation {deployment_id} completed successfully")
        else:
            log_message(deployment_id, f"ERROR: Systemd {operation} operation failed")
            deployments[deployment_id]["status"] = "failed"
            logger.error(f"Systemd operation {deployment_id} failed with return code {process.returncode}")
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during systemd operation: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in systemd operation {deployment_id}: {str(e)}")
        save_deployment_history()

# API to get deployment logs
@app.route('/api/deploy/<deployment_id>/logs')
def get_deployment_logs(deployment_id):
    logger.info(f"Getting logs for deployment: {deployment_id}")
    
    if request.headers.get('Accept') == 'text/event-stream':
        def generate():
            # Send current logs
            if deployment_id in deployments:
                for log in deployments[deployment_id]["logs"]:
                    yield f"data: {json.dumps({'message': log})}\n\n"
                
                current_log_count = len(deployments[deployment_id]["logs"])
                
                while deployments[deployment_id]["status"] == "running":
                    if len(deployments[deployment_id]["logs"]) > current_log_count:
                        for log in deployments[deployment_id]["logs"][current_log_count:]:
                            yield f"data: {json.dumps({'message': log})}\n\n"
                        
                        current_log_count = len(deployments[deployment_id]["logs"])
                    
                    time.sleep(1)
                
                # Send completion status
                status_msg = f"Deployment {deployments[deployment_id]['status']}."
                yield f"data: {json.dumps({'status': deployments[deployment_id]['status'], 'message': status_msg})}\n\n"
            else:
                logger.warning(f"Attempted to stream logs for non-existent deployment: {deployment_id}")
            
            return
        
        return Response(generate(), mimetype='text/event-stream')
    else:
        # Return all logs for a deployment
        if deployment_id not in deployments:
            logger.error(f"Deployment not found with ID: {deployment_id}")
            return jsonify({"error": "Deployment not found"}), 404
        
        return jsonify({"logs": deployments[deployment_id]["logs"]})

# API to get deployment history
@app.route('/api/deployments/history')
def get_deployment_history():
    logger.info("Getting deployment history")
    # Sort deployments by timestamp, newest first
    sorted_deployments = sorted(
        [d for d in deployments.values()],
        key=lambda x: x["timestamp"],
        reverse=True
    )
    
    # Convert timestamp to ISO format but keep logs
    for d in sorted_deployments:
        d["timestamp"] = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(d["timestamp"]))
    
    return jsonify(sorted_deployments)

# API to clear deployment logs
@app.route('/api/deployments/clear', methods=['POST'])
def clear_deployment_logs():
    data = request.json
    days = data.get('days', 0)
    
    logger.info(f"Request to clear deployment logs older than {days} days")
    
    if days < 0:
        return jsonify({"error": "Days must be a non-negative integer"}), 400
    
    count_before = len(deployments)
    
    # If days is 0, clear all logs
    if days == 0:
        deployments.clear()
        logger.info(f"Cleared all deployment logs ({count_before} entries)")
    else:
        # Calculate cutoff time
        cutoff_time = time.time() - (days * 24 * 60 * 60)
        
        # Remove deployments older than cutoff
        to_remove = []
        for deployment_id, deployment in deployments.items():
            if deployment["timestamp"] < cutoff_time:
                to_remove.append(deployment_id)
        
        for deployment_id in to_remove:
            del deployments[deployment_id]
            
        logger.info(f"Cleared {len(to_remove)} deployment logs older than {days} days")
    
    # Save updated history
    save_deployment_history()
    
    return jsonify({"message": f"Cleared {count_before - len(deployments)} deployment logs"})

# API to get shell command logs
@app.route('/api/command/<deployment_id>/logs')
def get_command_logs(deployment_id):
    logger.info(f"Getting command logs for deployment: {deployment_id}")
    
    if request.headers.get('Accept') == 'text/event-stream':
        def generate():
            # Send current logs
            if deployment_id in deployments and deployments[deployment_id]["type"] == "command":
                for log in deployments[deployment_id]["logs"]:
                    yield f"data: {json.dumps({'message': log})}\n\n"
                
                current_log_count = len(deployments[deployment_id]["logs"])
                
                while deployments[deployment_id]["status"] == "running":
                    if len(deployments[deployment_id]["logs"]) > current_log_count:
                        for log in deployments[deployment_id]["logs"][current_log_count:]:
                            yield f"data: {json.dumps({'message': log})}\n\n"
                        
                        current_log_count = len(deployments[deployment_id]["logs"])
                    
                    time.sleep(1)
                
                # Send completion status
                status_msg = f"Command execution {deployments[deployment_id]['status']}."
                yield f"data: {json.dumps({'status': deployments[deployment_id]['status'], 'message': status_msg})}\n\n"
            else:
                logger.warning(f"Attempted to stream logs for non-existent command: {deployment_id}")
            
            return
        
        return Response(generate(), mimetype='text/event-stream')
    else:
        # Return all logs for a command
        if deployment_id not in deployments:
            logger.error(f"Command not found with ID: {deployment_id}")
            return jsonify({"error": "Command not found"}), 404
        
        return jsonify({"logs": deployments[deployment_id]["logs"]})

# Helper function to log messages
def log_message(deployment_id, message):
    logger.debug(f"[{deployment_id}] {message}")
    if deployment_id in deployments:
        deployments[deployment_id]["logs"].append(message)
        
        # To ensure logs are persisted even if the app crashes
        # we save to history after every 5 logs
        if len(deployments[deployment_id]["logs"]) % 5 == 0:
            save_deployment_history()

if __name__ == '__main__':
    from waitress import serve
    logger.info("Starting Fix Deployment Orchestrator")
    serve(app, host="0.0.0.0", port=5000)
