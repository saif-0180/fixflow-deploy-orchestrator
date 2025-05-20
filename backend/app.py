
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
import os
import json
import subprocess
import time
import uuid
import threading
import logging
import glob
import re
from logging.handlers import RotatingFileHandler
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='../frontend/dist')

# Directory where fix files are stored
FIX_FILES_DIR = os.environ.get('FIX_FILES_DIR', '/app/fixfiles')

# Directory for deployment logs
DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')
APP_LOG_FILE = os.environ.get('APP_LOG_FILE', os.path.join(DEPLOYMENT_LOGS_DIR, 'application.log'))
DEPLOYMENT_HISTORY_FILE = os.path.join(DEPLOYMENT_LOGS_DIR, 'deployment_history.json')

# Create logs directory if it doesn't exist
os.makedirs(DEPLOYMENT_LOGS_DIR, exist_ok=True)
os.makedirs('/tmp/ansible-ssh', exist_ok=True)  # Ensure ansible control path directory exists
os.chmod('/tmp/ansible-ssh', 0o777)  # Set proper permissions for ansible control path

# Configure application logging
logger = logging.getLogger('fix_deployment_orchestrator')
logger.setLevel(logging.DEBUG)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_format)

# File handler (with rotation)
os.makedirs(os.path.dirname(APP_LOG_FILE), exist_ok=True)  # Ensure log directory exists
file_handler = RotatingFileHandler(APP_LOG_FILE, maxBytes=10485760, backupCount=10) # 10MB per file, keep 10 files
file_handler.setLevel(logging.DEBUG)
file_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_format)

# Add handlers
logger.addHandler(console_handler)
logger.addHandler(file_handler)

logger.info("Starting Fix Deployment Orchestrator with enhanced logging")
logger.debug(f"Application environment: FLASK_ENV={os.environ.get('FLASK_ENV', 'production')}")
logger.debug(f"Fix files directory: {FIX_FILES_DIR}")
logger.debug(f"Deployment logs directory: {DEPLOYMENT_LOGS_DIR}")
logger.debug(f"Application log file: {APP_LOG_FILE}")

# Dictionary to store deployment information
deployments = {}

# Try to load previous deployments if they exist
try:
    if os.path.exists(DEPLOYMENT_HISTORY_FILE):
        with open(DEPLOYMENT_HISTORY_FILE, 'r') as f:
            try:
                deployments = json.load(f)
                logger.info(f"Loaded {len(deployments)} previous deployments from history file")
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing deployment history file: {str(e)}")
                # Create a backup of the corrupted file
                backup_file = os.path.join(DEPLOYMENT_LOGS_DIR, f'deployment_history_corrupt_{int(time.time())}.json')
                os.rename(DEPLOYMENT_HISTORY_FILE, backup_file)
                logger.info(f"Renamed corrupted history file to {backup_file}")
                deployments = {}
    else:
        # Look for backup history files in the logs directory
        backup_files = sorted(glob.glob(os.path.join(DEPLOYMENT_LOGS_DIR, 'deployment_history_*.json')), reverse=True)
        if backup_files:
            logger.info(f"Found {len(backup_files)} backup deployment history files, loading most recent")
            for backup_file in backup_files:
                try:
                    with open(backup_file, 'r') as f:
                        deployments = json.load(f)
                    logger.info(f"Loaded {len(deployments)} previous deployments from backup file {backup_file}")
                    break
                except (json.JSONDecodeError, Exception) as e:
                    logger.error(f"Error loading from backup file {backup_file}: {str(e)}")
                    continue
        else:
            logger.info("No deployment history file found, creating new one")
            # Create an empty history file
            with open(DEPLOYMENT_HISTORY_FILE, 'w') as f:
                json.dump({}, f)
except Exception as e:
    logger.error(f"Failed to load deployment history: {str(e)}")

# Load inventory from file or create a default one
INVENTORY_FILE = os.environ.get('INVENTORY_FILE', '/app/inventory/inventory.json')
os.makedirs(os.path.dirname(INVENTORY_FILE), exist_ok=True)

try:
    with open(INVENTORY_FILE, 'r') as f:
        inventory = json.load(f)
    logger.info(f"Loaded inventory with {len(inventory.get('vms', []))} VMs")
except (FileNotFoundError, json.JSONDecodeError) as e:
    logger.warning(f"Error loading inventory: {str(e)}")
    # Default inventory structure
    inventory = {
        "vms": [
            {"name": "batch1", "type": "batch", "ip": "192.168.1.10"},
            {"name": "batch2", "type": "batch", "ip": "192.168.1.11"},
            {"name": "imdg1", "type": "imdg", "ip": "192.168.1.20"},
            {"name": "imdg2", "type": "imdg", "ip": "192.168.1.21"},
            {"name": "airflow", "type": "airflow", "ip": "192.168.1.30"}
        ],
        "users": ["infadm", "abpwrk1", "root"],
        "db_users": ["postgres", "dbadmin"],
        "systemd_services": ["hazelcast", "kafka", "zookeeper", "airflow-scheduler"]
    }
    with open(INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f)
    logger.info("Created default inventory configuration")

# Function to save inventory
def save_inventory():
    try:
        with open(INVENTORY_FILE, 'w') as f:
            json.dump(inventory, f)
        logger.info("Saved inventory configuration")
    except Exception as e:
        logger.error(f"Error saving inventory: {str(e)}")

# Function to save deployment history with backup
def save_deployment_history():
    try:
        # Create a backup of the current history file if it exists
        if os.path.exists(DEPLOYMENT_HISTORY_FILE):
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            backup_file = os.path.join(DEPLOYMENT_LOGS_DIR, f'deployment_history_{timestamp}.json')
            try:
                with open(DEPLOYMENT_HISTORY_FILE, 'r') as src:
                    with open(backup_file, 'w') as dst:
                        dst.write(src.read())
                logger.debug(f"Created backup of deployment history: {backup_file}")
            except Exception as e:
                logger.error(f"Error creating backup of history file: {str(e)}")
        
        # Save the current deployment history
        with open(DEPLOYMENT_HISTORY_FILE, 'w') as f:
            json.dump(deployments, f)
        logger.info(f"Saved {len(deployments)} deployments to history file")
        
        # Clean up old backup files (keep only last 10)
        backup_files = sorted(glob.glob(os.path.join(DEPLOYMENT_LOGS_DIR, 'deployment_history_*.json')))
        if len(backup_files) > 10:
            for old_file in backup_files[:-10]:
                try:
                    os.remove(old_file)
                    logger.debug(f"Removed old backup file: {old_file}")
                except Exception as e:
                    logger.error(f"Error removing old backup file {old_file}: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to save deployment history: {str(e)}")

# Helper function to log message to deployment log
def log_message(deployment_id, message):
    """Log a message to the deployment logs and the application log"""
    if deployment_id in deployments:
        # Add to deployment logs
        if "logs" not in deployments[deployment_id]:
            deployments[deployment_id]["logs"] = []
        deployments[deployment_id]["logs"].append(message)
        
        # Also log to application log
        logger.debug(f"[{deployment_id}] {message}")

# Check SSH key permissions and setup
def check_ssh_setup():
    try:
        # Check if SSH keys exist
        ssh_key_path = "/root/.ssh/id_rsa"
        if os.path.exists(ssh_key_path):
            # Ensure correct permissions
            os.chmod(ssh_key_path, 0o600)
            logger.info("SSH private key found and permissions set to 600")
            
            # Also check that the .ssh directory has proper permissions
            os.chmod("/root/.ssh", 0o700)
            logger.info("SSH directory permissions set to 700")

            # Check control_path_dir permissions
            control_path = "/tmp/ansible-ssh"
            if os.path.exists(control_path):
                os.chmod(control_path, 0o777)
                logger.info(f"Ansible SSH control path directory permissions set to 777: {control_path}")
            else:
                os.makedirs(control_path, exist_ok=True)
                os.chmod(control_path, 0o777)
                logger.info(f"Created Ansible SSH control path directory with permissions 777: {control_path}")
            
            # Test SSH key with ssh-keygen -l
            result = subprocess.run(
                ["ssh-keygen", "-l", "-f", ssh_key_path], 
                capture_output=True, 
                text=True
            )
            if result.returncode == 0:
                logger.info(f"SSH key validated: {result.stdout.strip()}")
            else:
                logger.warning(f"SSH key validation failed: {result.stderr.strip()}")
        else:
            logger.critical(f"SSH private key not found at {ssh_key_path}")
    except Exception as e:
        logger.error(f"Error during SSH setup check: {str(e)}")

# Test SSH connection to each VM
def test_ssh_connections():
    for vm in inventory.get("vms", []):
        try:
            vm_name = vm.get("name")
            vm_ip = vm.get("ip")
            if not vm_name or not vm_ip:
                continue
                
            logger.info(f"Testing SSH connection to {vm_name} ({vm_ip})")
            cmd = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", 
                  "-i", "/root/.ssh/id_rsa", f"infadm@{vm_ip}", "echo 'SSH Connection Test'"]
                
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                logger.info(f"SSH connection to {vm_name} ({vm_ip}) successful")
            else:
                logger.warning(f"SSH connection to {vm_name} ({vm_ip}) failed: {result.stderr.strip()}")
        except Exception as e:
            logger.error(f"Error testing SSH connection to {vm_name}: {str(e)}")

# Run SSH setup check at startup
check_ssh_setup()
# Test SSH connections at startup
test_ssh_connections()

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
    create_backup = data.get('createBackup', True)  # Default to true for safety
    
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
        "create_backup": create_backup,
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
        create_backup = deployment.get("create_backup", True)
        
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
        
        # Create a more robust playbook that creates target directory if needed
        final_target_path = os.path.join(target_path, file_name)
        target_dir = os.path.dirname(final_target_path)
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Deploy file to VMs
  hosts: deployment_targets
  gather_facts: false
  become: {"true" if sudo else "false"}
  become_method: sudo
  become_user: {user}
  tasks:
    # First test SSH connection to ensure it works
    - name: Test connection
      ansible.builtin.ping:
      register: ping_result
      
    # Create the full target directory path if it does not exist
    - name: Create target directory structure if it does not exist
      ansible.builtin.file:
        path: "{target_dir}"
        state: directory
        mode: '0755'
        recurse: yes
      become: {"true" if sudo else "false"}
      become_user: {user}
      
    # Check if file exists first to support backup
    - name: Check if file already exists
      ansible.builtin.stat:
        path: "{final_target_path}"
      register: file_stat
      
    # Create backup of existing file if requested
    - name: Create backup of existing file if it exists
      ansible.builtin.copy:
        src: "{final_target_path}"
        dest: "{final_target_path}.bak.{{ ansible_date_time.epoch }}"
        remote_src: yes
      when: file_stat.stat.exists and {str(create_backup).lower()}
      register: backup_result
      
    # Log backup creation
    - name: Log backup result
      ansible.builtin.debug:
        msg: "Created backup at {{ backup_result.dest }}"
      when: backup_result.changed is defined and backup_result.changed
      
    # Copy the file to the target location
    - name: Copy file to target VMs
      ansible.builtin.copy:
        src: "{source_file}"
        dest: "{final_target_path}"
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
                    # Add ansible_ssh_common_args to disable StrictHostKeyChecking for this connection
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/root/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ControlMaster=auto -o ControlPath=/tmp/ansible-ssh/%h-%p-%r -o ControlPersist=60s'\n")
        
        logger.debug(f"Created Ansible inventory: {inventory_file}")
        log_message(deployment_id, f"Created inventory file with targets: {', '.join(vms)}")
        
        # Test SSH connection to each target VM
        for vm_name in vms:
            vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
            if vm:
                log_message(deployment_id, f"Testing SSH connection to {vm_name} ({vm['ip']})")
                cmd = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", 
                      "-i", "/root/.ssh/id_rsa", f"infadm@{vm['ip']}", "echo 'SSH Connection Test'"]
                
                try:
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        log_message(deployment_id, f"SSH connection to {vm_name} successful")
                    else:
                        log_message(deployment_id, f"SSH connection to {vm_name} failed: {result.stderr.strip()}")
                except Exception as e:
                    log_message(deployment_id, f"SSH connection test error: {str(e)}")
        
        # Create ssh control directory to avoid "cannot bind to path" errors
        os.makedirs('/tmp/ansible-ssh', exist_ok=True)
        os.chmod('/tmp/ansible-ssh', 0o777)
        log_message(deployment_id, "Ensured ansible control path directory exists with permissions 777")
        
        # Run ansible playbook
        env_vars = os.environ.copy()
        env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
        env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
        env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
        
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env_vars)
        
        for line in process.stdout:
            line_stripped = line.strip()
            log_message(deployment_id, line_stripped)
            # Also log to main application log
            logger.debug(f"[{deployment_id}] {line_stripped}")
        
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
        try:
            os.remove(playbook_file)
            os.remove(inventory_file)
            logger.debug(f"Cleaned up temporary files for deployment {deployment_id}")
        except Exception as e:
            logger.warning(f"Error cleaning up temporary files: {str(e)}")
        
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
    
    data = request.json or {}
    use_sudo = data.get('sudo', False)
    
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
        
        # Generate a playbook to run cksum command
        validate_playbook = f"/tmp/validate_{deployment_id}_{vm_name}.yml"
        with open(validate_playbook, 'w') as f:
            f.write(f"""---
- name: Validate file
  hosts: {vm_name}
  gather_facts: false
  become: {"true" if use_sudo else "false"}
  tasks:
    - name: Check if file exists
      stat:
        path: "{target_path}"
      register: file_check
      failed_when: not file_check.stat.exists
      
    - name: Run cksum command
      shell: cksum "{target_path}" | awk '{{print $1, $2}}'
      register: cksum_result
      when: file_check.stat.exists
      
    - name: Get file permissions
      shell: ls -la "{target_path}" | awk '{{print $1, $3, $4}}'
      register: perm_result
      when: file_check.stat.exists
""")
        
        # Generate inventory file
        validate_inventory = f"/tmp/validate_inventory_{deployment_id}_{vm_name}"
        with open(validate_inventory, 'w') as f:
            f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/root/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ControlMaster=auto -o ControlPath=/tmp/ansible-ssh/%h-%p-%r -o ControlPersist=60s'")
        
        log_message(deployment_id, f"Running validation on {vm_name}")
        cmd = ["ansible-playbook", "-i", validate_inventory, validate_playbook, "--limit", vm_name, "-v"]
        
        try:
            output = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
            logger.debug(f"Validation output for {vm_name}: {output}")
            log_message(deployment_id, f"Raw validation output on {vm_name}: {output}")
            
            # Check if cksum information is in output
            cksum_info = "File not found"
            perm_info = "N/A"
            
            # Extract checksum using regex
            cksum_match = re.search(r'cksum_result.*?stdout.*?"(.*?)"', output, re.DOTALL)
            if cksum_match:
                cksum_info = cksum_match.group(1)
                logger.debug(f"Extracted checksum: {cksum_info}")
            
            # Extract permissions using regex
            perm_match = re.search(r'perm_result.*?stdout.*?"(.*?)"', output, re.DOTALL)
            if perm_match:
                perm_info = perm_match.group(1)
                logger.debug(f"Extracted permissions: {perm_info}")
            
            result_message = f"Validation on {vm_name}: Checksum={cksum_info}, Permissions={perm_info}"
            log_message(deployment_id, result_message)
            
            results.append({
                "vm": vm_name,
                "status": "SUCCESS",
                "cksum": cksum_info,
                "permissions": perm_info
            })
            
            # Clean up temp files
            try:
                os.remove(validate_playbook)
                os.remove(validate_inventory)
            except:
                pass
                
        except subprocess.CalledProcessError as e:
            error = e.output.decode().strip()
            log_message(deployment_id, f"Validation failed on {vm_name}: {error}")
            results.append({
                "vm": vm_name,
                "status": "ERROR",
                "output": error
            })
    
    logger.info(f"Validation completed for deployment {deployment_id} with {len(results)} results")
    save_deployment_history()  # Save logs from validation
    return jsonify({"results": results})

# API to run shell command
@app.route('/api/command/shell', methods=['POST'])
def run_shell_command():
    data = request.json
    command = data.get('command')
    vms = data.get('vms')
    sudo = data.get('sudo', False)
    user = data.get('user', 'infadm')
    working_dir = data.get('workingDir', '')
    
    logger.info(f"Shell command request received: '{command}' on {len(vms)} VMs as user {user}")
    
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
        "working_dir": working_dir,
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start command execution in a separate thread
    threading.Thread(target=process_shell_command, args=(deployment_id,)).start()
    
    logger.info(f"Shell command initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id, "commandId": deployment_id})

def process_shell_command(deployment_id):
    deployment = deployments[deployment_id]
    
    try:
        command = deployment["command"]
        vms = deployment["vms"]
        sudo = deployment["sudo"]
        user = deployment.get("user", "infadm")
        working_dir = deployment.get("working_dir", "")
        
        log_message(deployment_id, f"Running command on {len(vms)} VMs: {command}")
        
        # Generate an ansible playbook for shell command
        playbook_file = f"/tmp/shell_command_{deployment_id}.yml"
        
        # Enhanced playbook that properly escapes command and handles working directory
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Run shell command on VMs
  hosts: command_targets
  gather_facts: true
  become: {"true" if sudo else "false"}
  become_method: sudo
  become_user: {user}
  tasks:
    # Test connection
    - name: Test connection
      ansible.builtin.ping:
      
    # Create working directory if specified and doesn't exist
    - name: Ensure working directory exists
      ansible.builtin.file:
        path: "{working_dir}"
        state: directory
        mode: '0755'
      when: "{bool(working_dir)}" | bool
      become: {"true" if sudo else "false"}
      become_user: {user}
      
    - name: Execute shell command
      ansible.builtin.shell: {command}
      args:
        executable: /bin/bash
        chdir: "{working_dir if working_dir else '~'}"
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
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/root/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ControlMaster=auto -o ControlPath=/tmp/ansible-ssh/%h-%p-%r -o ControlPersist=60s'\n")
        
        logger.debug(f"Created Ansible inventory: {inventory_file}")
        
        # Ensure control path directory exists
        os.makedirs('/tmp/ansible-ssh', exist_ok=True)
        os.chmod('/tmp/ansible-ssh', 0o777)
        
        # Run ansible playbook
        env_vars = os.environ.copy()
        env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
        env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
        env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
        
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env_vars)
        
        for line in process.stdout:
            line_stripped = line.strip()
            log_message(deployment_id, line_stripped)
            # Also log to main application log
            logger.debug(f"[{deployment_id}] {line_stripped}")
        
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
        try:
            os.remove(playbook_file)
            os.remove(inventory_file)
        except Exception as e:
            logger.warning(f"Error cleaning up temporary files: {str(e)}")
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during shell command execution: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in shell command {deployment_id}: {str(e)}")
        save_deployment_history()

# API to get deployment history
@app.route('/api/deployments/history')
def get_deployment_history():
    logger.info("Getting deployment history")
    
    # Check if deployments is empty, try to reload from file
    if not deployments:
        try:
            if os.path.exists(DEPLOYMENT_HISTORY_FILE):
                with open(DEPLOYMENT_HISTORY_FILE, 'r') as f:
                    loaded_deployments = json.load(f)
                    if loaded_deployments:
                        # Update global deployments dictionary
                        deployments.clear()
                        deployments.update(loaded_deployments)
                        logger.info(f"Reloaded {len(deployments)} deployments from history file")
        except Exception as e:
            logger.error(f"Failed to reload deployment history: {str(e)}")
    
    # Sort deployments by timestamp, newest first
    sorted_deployments = sorted(
        [d for d in deployments.values()],
        key=lambda x: x.get("timestamp", 0),
        reverse=True
    )
    
    # Convert timestamp to ISO format and ensure all required fields are present
    for d in sorted_deployments:
        d["timestamp"] = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(d.get("timestamp", 0)))
        # Ensure logs field is present
        if "logs" not in d:
            d["logs"] = []
    
    return jsonify(sorted_deployments)

# API to get logs for a specific deployment
@app.route('/api/deploy/<deployment_id>/logs')
def get_deployment_logs(deployment_id):
    logger.info(f"Getting logs for deployment: {deployment_id}")
    
    # Check if client expects server-sent events
    accept_header = request.headers.get('Accept', '')
    if 'text/event-stream' in accept_header:
        # Return SSE stream for real-time logs
        def generate():
            if deployment_id in deployments:
                deployment = deployments[deployment_id]
                # First send all existing logs
                for log in deployment.get("logs", []):
                    yield f"data: {json.dumps({'message': log})}\n\n"

                # Send current status
                yield f"data: {json.dumps({'status': deployment.get('status', 'running')})}\n\n"

                # Return if deployment is already completed
                if deployment.get("status") in ["success", "failed"]:
                    return
                
                # Otherwise, keep the connection open for new logs
                last_log_count = len(deployment.get("logs", []))
                while deployment_id in deployments:
                    current_logs = deployments[deployment_id].get("logs", [])
                    current_count = len(current_logs)
                    
                    # Send new logs
                    if current_count > last_log_count:
                        for i in range(last_log_count, current_count):
                            yield f"data: {json.dumps({'message': current_logs[i]})}\n\n"
                        last_log_count = current_count
                    
                    # Check if deployment status has changed
                    status = deployments[deployment_id].get("status")
                    if status in ["success", "failed"]:
                        yield f"data: {json.dumps({'status': status})}\n\n"
                        break
                    
                    time.sleep(1)
            else:
                yield f"data: {json.dumps({'error': 'Deployment not found'})}\n\n"

        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    else:
        # Return regular JSON response for non-streaming requests
        if deployment_id in deployments:
            return jsonify({
                "logs": deployments[deployment_id].get("logs", []),
                "status": deployments[deployment_id].get("status", "unknown")
            })
        else:
            return jsonify({"error": "Deployment not found"}), 404

# API to get logs for a specific command
@app.route('/api/command/<command_id>/logs')
def get_command_logs(command_id):
    logger.info(f"Getting logs for command: {command_id}")
    
    # Check if client expects server-sent events
    accept_header = request.headers.get('Accept', '')
    if 'text/event-stream' in accept_header:
        # Return SSE stream for real-time logs
        def generate():
            if command_id in deployments:
                command = deployments[command_id]
                # First send all existing logs
                for log in command.get("logs", []):
                    yield f"data: {json.dumps({'message': log})}\n\n"

                # Send current status
                yield f"data: {json.dumps({'status': command.get('status', 'running')})}\n\n"

                # Return if command is already completed
                if command.get("status") in ["success", "failed"]:
                    return
                
                # Otherwise, keep the connection open for new logs
                last_log_count = len(command.get("logs", []))
                while command_id in deployments:
                    current_logs = deployments[command_id].get("logs", [])
                    current_count = len(current_logs)
                    
                    # Send new logs
                    if current_count > last_log_count:
                        for i in range(last_log_count, current_count):
                            yield f"data: {json.dumps({'message': current_logs[i]})}\n\n"
                        last_log_count = current_count
                    
                    # Check if command status has changed
                    status = deployments[command_id].get("status")
                    if status in ["success", "failed"]:
                        yield f"data: {json.dumps({'status': status})}\n\n"
                        break
                    
                    time.sleep(1)
            else:
                yield f"data: {json.dumps({'error': 'Command not found'})}\n\n"

        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    else:
        # Return regular JSON response for non-streaming requests
        if command_id in deployments:
            return jsonify({
                "logs": deployments[command_id].get("logs", []),
                "status": deployments[command_id].get("status", "unknown")
            })
        else:
            return jsonify({"error": "Command not found"}), 404

# Add a rollback endpoint
@app.route('/api/deploy/<deployment_id>/rollback', methods=['POST'])
def rollback_deployment(deployment_id):
    logger.info(f"Rolling back deployment with ID: {deployment_id}")
    
    if deployment_id not in deployments:
        logger.error(f"Deployment not found with ID: {deployment_id}")
        return jsonify({"error": "Deployment not found"}), 404
    
    deployment = deployments[deployment_id]
    
    if deployment["type"] != "file":
        logger.error(f"Cannot rollback non-file deployment type: {deployment['type']}")
        return jsonify({"error": "Only file deployments can be rolled back"}), 400
    
    # Generate a new deployment ID for the rollback operation
    rollback_id = str(uuid.uuid4())
    
    # Create a rollback deployment record
    deployments[rollback_id] = {
        "id": rollback_id,
        "type": "rollback",
        "original_deployment": deployment_id,
        "ft": deployment.get("ft"),
        "file": deployment.get("file"),
        "target_path": deployment.get("target_path"),
        "vms": deployment.get("vms"),
        "user": deployment.get("user"),
        "sudo": deployment.get("sudo", False),
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Save deployment history
    save_deployment_history()
    
    # Start rollback in a separate thread
    threading.Thread(target=process_rollback, args=(rollback_id,)).start()
    
    logger.info(f"Rollback initiated with ID: {rollback_id}")
    return jsonify({"deploymentId": rollback_id})

def process_rollback(rollback_id):
    rollback = deployments[rollback_id]
    
    try:
        original_id = rollback["original_deployment"]
        vms = rollback["vms"]
        target_path = os.path.join(rollback["target_path"], rollback["file"])
        user = rollback["user"]
        sudo = rollback["sudo"]
        
        log_message(rollback_id, f"Starting rollback for deployment {original_id}")
        
        # Find most recent backup for each VM
        for vm_name in vms:
            vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
            if not vm:
                log_message(rollback_id, f"ERROR: VM {vm_name} not found in inventory")
                continue
                
            # Generate playbook for finding and restoring backup
            playbook_file = f"/tmp/rollback_{rollback_id}_{vm_name}.yml"
            with open(playbook_file, 'w') as f:
                f.write(f"""---
- name: Rollback file deployment
  hosts: {vm_name}
  gather_facts: false
  become: {"true" if sudo else "false"}
  become_user: {user}
  tasks:
    - name: Test connection
      ping:
      
    - name: Find backup files
      ansible.builtin.find:
        paths: "{os.path.dirname(target_path)}"
        patterns: "{os.path.basename(target_path)}.bak.*"
      register: backup_files
      
    - name: Set fact for newest backup
      ansible.builtin.set_fact:
        newest_backup: "{{ backup_files.files | sort(attribute='mtime') | last }}"
      when: backup_files.matched > 0
      
    - name: Restore from backup
      ansible.builtin.copy:
        src: "{{ newest_backup.path }}"
        dest: "{target_path}"
        remote_src: yes
      when: backup_files.matched > 0
      register: restore_result
      
    - name: Log restore result
      ansible.builtin.debug:
        msg: "Restored {{ newest_backup.path }} to {target_path}"
      when: backup_files.matched > 0 and restore_result.changed
      
    - name: No backups found
      ansible.builtin.debug:
        msg: "No backup files found for {target_path}"
      when: backup_files.matched == 0
""")
                
            # Generate inventory file
            inventory_file = f"/tmp/rollback_inventory_{rollback_id}_{vm_name}"
            with open(inventory_file, 'w') as f:
                f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/root/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ControlMaster=auto -o ControlPath=/tmp/ansible-ssh/%h-%p-%r -o ControlPersist=60s'")
                
            # Run ansible playbook
            cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
            log_message(rollback_id, f"Running rollback on {vm_name}")
            
            env_vars = os.environ.copy()
            env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
            env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
            env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
            env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
            
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env_vars)
            
            for line in process.stdout:
                log_message(rollback_id, line.strip())
                
            process.wait()
            
            if process.returncode == 0:
                log_message(rollback_id, f"Rollback completed successfully on {vm_name}")
            else:
                log_message(rollback_id, f"Rollback failed on {vm_name}")
                
            # Cleanup
            try:
                os.remove(playbook_file)
                os.remove(inventory_file)
            except:
                pass
                
        # Update rollback status
        deployments[rollback_id]["status"] = "success"
        log_message(rollback_id, "Rollback operation completed")
        save_deployment_history()
        
    except Exception as e:
        log_message(rollback_id, f"ERROR: Exception during rollback: {str(e)}")
        deployments[rollback_id]["status"] = "failed"
        logger.exception(f"Exception in rollback {rollback_id}: {str(e)}")
        save_deployment_history()

# API to clear deployment history
@app.route('/api/deployments/clear', methods=['POST'])
def clear_deployment_history():
    days = request.json.get('days', 30)
    logger.info(f"Clearing deployment logs older than {days} days")
    
    if days < 0:
        return jsonify({"error": "Days must be a positive number"}), 400
    
    # Calculate cutoff timestamp
    cutoff_time = time.time() - (days * 86400)  # 86400 seconds in a day
    
    # Count deployments before deletion
    initial_count = len(deployments)
    
    # Filter deployments to keep only those newer than the cutoff
    if days == 0:  # If days is 0, clear all logs
        deployments.clear()
    else:
        to_delete = [deployment_id for deployment_id, deployment in deployments.items() 
                     if deployment.get('timestamp', 0) < cutoff_time]
        
        for deployment_id in to_delete:
            del deployments[deployment_id]
    
    # Count how many were deleted
    deleted_count = initial_count - len(deployments)
    
    # Save updated deployment history
    save_deployment_history()
    
    return jsonify({
        "message": f"Successfully cleared {deleted_count} deployment logs",
        "deleted_count": deleted_count,
        "remaining_count": len(deployments)
    })

# API endpoint to update systemd service
@app.route('/api/systemd/<operation>', methods=['POST'])
def systemd_operation(operation):
    data = request.json
    operation = data.get('operation', '').strip().lower()
    service = data.get('service')
    vms = data.get('vms')
    
    if not all([service, vms, operation]):
        logger.error("Missing required parameters for systemd operation")
        return jsonify({"error": "Missing required parameters"}), 400
    
    if operation not in ['start', 'stop', 'restart', 'status']:
        logger.error(f"Invalid systemd operation: {operation}")
        return jsonify({"error": "Invalid operation. Must be one of: start, stop, restart, status"}), 400
    
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
    threading.Thread(target=process_systemd_operation, args=(deployment_id, operation, service, vms)).start()
    
    logger.info(f"Systemd {operation} initiated with ID: {deployment_id}")
    return jsonify({"deploymentId": deployment_id})

def process_systemd_operation(deployment_id, operation, service, vms):
    try:
        log_message(deployment_id, f"Starting systemd {operation} for {service} on {len(vms)} VMs")
        
        # Generate an ansible playbook for systemd operation
        playbook_file = f"/tmp/systemd_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Systemd {operation} operation
  hosts: systemd_targets
  gather_facts: false
  become: true
  tasks:
    - name: Check if service exists
      stat:
        path: "/usr/lib/systemd/system/{service}"
      register: service_file
      
    - name: Get service status
      systemd:
        name: "{service}"
        state: "{operation if operation != 'status' else 'started'}"
        enabled: yes
      register: service_result
      when: service_file.stat.exists
      changed_when: false
      failed_when: false
      check_mode: "{operation == 'status'}"
      
    - name: Display service status
      debug:
        var: service_result
      when: service_file.stat.exists and '{operation}' == 'status'
      
    - name: Perform systemd operation
      systemd:
        name: "{service}"
        state: "{operation if operation != 'status' else 'started'}"
      when: service_file.stat.exists and '{operation}' != 'status'
      register: operation_result
      
    - name: Log operation result
      debug:
        msg: "Service operation {operation} on {service} was successful"
      when: service_file.stat.exists and '{operation}' != 'status'
""")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[systemd_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/root/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ControlMaster=auto -o ControlPath=/tmp/ansible-ssh/%h-%p-%r -o ControlPersist=60s'\n")
        
        # Run ansible playbook
        env_vars = os.environ.copy()
        env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
        env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
        env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
        
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env_vars)
        
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
        try:
            os.remove(playbook_file)
            os.remove(inventory_file)
        except Exception as e:
            logger.warning(f"Error cleaning up temporary files: {str(e)}")
        
        # Save deployment history after completion
        save_deployment_history()
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during systemd operation: {str(e)}")
        deployments[deployment_id]["status"] = "failed"
        logger.exception(f"Exception in systemd operation {deployment_id}: {str(e)}")
        save_deployment_history()

if __name__ == '__main__':
    from waitress import serve
    logger.info("Starting Fix Deployment Orchestrator")
    
    # Ensure required directories exist
    os.makedirs('/tmp/ansible-ssh', exist_ok=True)
    os.chmod('/tmp/ansible-ssh', 0o777)
    logger.info("Ensured ansible control path directory exists with permissions 777")
    
    # Print SSH key information for debugging
    logger.info("Checking SSH key setup...")
    check_ssh_setup()
    
    serve(app, host="0.0.0.0", port=5000)
