
from flask import Flask, request, jsonify, send_from_directory, Response
import os
import json
import subprocess
import time
import uuid
import threading
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='../frontend/dist')

# Directory where fix files are stored
FIX_FILES_DIR = os.environ.get('FIX_FILES_DIR', '/app/fixfiles')

# Directory for deploymnet logs
DEPLOYMENT_LOGS_DIR = os.environ.get('DEPLOYMENT_LOGS_DIR', '/app/logs')

# Create logs directory if it doesn't exist
os.makedirs(DEPLOYMENT_LOGS_DIR, exist_ok=True)

# Dictionary to store deployment information
deployments = {}

# Load inventory from file or create a default one
INVENTORY_FILE = os.environ.get('INVENTORY_FILE', '/app/inventory/inventory.json')
os.makedirs(os.path.dirname(INVENTORY_FILE), exist_ok=True)

try:
    with open(INVENTORY_FILE, 'r') as f:
        inventory = json.load(f)
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

# Function to save inventory
def save_inventory():
    with open(INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f)

# Serve React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

# API to get all FTs
@app.route('/api/fts')
def get_fts():
    ft_type = request.args.get('type', None)
    
    all_fts = []
    fts_dir = os.path.join(FIX_FILES_DIR, 'AllFts')
    
    if os.path.exists(fts_dir):
        all_fts = [d for d in os.listdir(fts_dir) if os.path.isdir(os.path.join(fts_dir, d))]
    
    if ft_type == 'sql':
        # Filter FTs that have SQL files
        filtered_fts = []
        for ft in all_fts:
            ft_dir = os.path.join(fts_dir, ft)
            if any(f.endswith('.sql') for f in os.listdir(ft_dir)):
                filtered_fts.append(ft)
        return jsonify(filtered_fts)
    
    return jsonify(all_fts)

# API to get files for an FT
@app.route('/api/fts/<ft>/files')
def get_ft_files(ft):
    ft_type = request.args.get('type', None)
    
    ft_dir = os.path.join(FIX_FILES_DIR, 'AllFts', ft)
    
    if not os.path.exists(ft_dir):
        return jsonify([])
    
    if ft_type == 'sql':
        # Return only SQL files
        sql_files = [f for f in os.listdir(ft_dir) if f.endswith('.sql')]
        return jsonify(sql_files)
    
    # Return all files
    files = [f for f in os.listdir(ft_dir) if os.path.isfile(os.path.join(ft_dir, f))]
    return jsonify(files)

# API to get VMs
@app.route('/api/vms')
def get_vms():
    return jsonify(inventory["vms"])

# API to get DB users
@app.route('/api/db/users')
def get_db_users():
    return jsonify(inventory["db_users"])

# API to get systemd services
@app.route('/api/systemd/services')
def get_systemd_services():
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
    
    if not all([ft, file_name, user, target_path, vms]):
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
    
    # Start deployment in a separate thread
    threading.Thread(target=process_file_deployment, args=(deployment_id,)).start()
    
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
        
        if not os.path.exists(source_file):
            log_message(deployment_id, f"ERROR: Source file not found: {source_file}")
            deployments[deployment_id]["status"] = "failed"
            return
        
        log_message(deployment_id, f"Starting file deployment for {file_name} to {len(vms)} VMs")
        
        # Generate an ansible playbook for file deployment
        playbook_file = f"/tmp/file_deploy_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Deploy file to VMs
  hosts: deployment_targets
  gather_facts: false
  tasks:
    - name: Create target directory if it does not exist
      ansible.builtin.file:
        path: "{os.path.dirname(target_path)}"
        state: directory
        mode: '0755'
      {'become: true' if sudo else ''}
      
    - name: Copy file to target VMs
      ansible.builtin.copy:
        src: "{source_file}"
        dest: "{os.path.join(target_path, file_name)}"
        mode: '0644'
        owner: "{user}"
      {'become: true' if sudo else ''}
      register: copy_result
      
    - name: Log copy result
      ansible.builtin.debug:
        msg: "File copied successfully to {{ inventory_hostname }}"
      when: copy_result.changed
""")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[deployment_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: File deployment completed successfully")
            deployments[deployment_id]["status"] = "success"
        else:
            log_message(deployment_id, "ERROR: File deployment failed")
            deployments[deployment_id]["status"] = "failed"
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during file deployment: {str(e)}")
        deployments[deployment_id]["status"] = "failed"

# API to validate file deployment
@app.route('/api/deploy/<deployment_id>/validate', methods=['POST'])
def validate_deployment(deployment_id):
    if deployment_id not in deployments:
        return jsonify({"error": "Deployment not found"}), 404
    
    deployment = deployments[deployment_id]
    
    if deployment["type"] != "file":
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
    
    return jsonify({"results": results})

# API to run shell command
@app.route('/api/command/shell', methods=['POST'])
def run_shell_command():
    data = request.json
    command = data.get('command')
    vms = data.get('vms')
    sudo = data.get('sudo', False)
    
    if not all([command, vms]):
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
        "status": "running",
        "timestamp": time.time(),
        "logs": []
    }
    
    # Start command execution in a separate thread
    threading.Thread(target=process_shell_command, args=(deployment_id,)).start()
    
    return jsonify({"deploymentId": deployment_id})

def process_shell_command(deployment_id):
    deployment = deployments[deployment_id]
    
    try:
        command = deployment["command"]
        vms = deployment["vms"]
        sudo = deployment["sudo"]
        
        log_message(deployment_id, f"Running command on {len(vms)} VMs: {command}")
        
        # Generate an ansible playbook for shell command
        playbook_file = f"/tmp/shell_command_{deployment_id}.yml"
        
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Run shell command on VMs
  hosts: command_targets
  gather_facts: false
  tasks:
    - name: Execute shell command
      ansible.builtin.shell: {command}
      {'become: true' if sudo else ''}
      register: command_result
      
    - name: Log command result
      ansible.builtin.debug:
        var: command_result.stdout_lines
""")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[command_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, "SUCCESS: Shell command executed successfully")
            deployments[deployment_id]["status"] = "success"
        else:
            log_message(deployment_id, "ERROR: Shell command execution failed")
            deployments[deployment_id]["status"] = "failed"
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during shell command execution: {str(e)}")
        deployments[deployment_id]["status"] = "failed"

# API to deploy SQL file
@app.route('/api/deploy/sql', methods=['POST'])
def deploy_sql():
    data = request.json
    ft = data.get('ft')
    file_name = data.get('file')
    db_user = data.get('dbUser')
    db_password = data.get('dbPassword')
    
    if not all([ft, file_name, db_user, db_password]):
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
    
    # Start SQL deployment in a separate thread
    threading.Thread(target=process_sql_deployment, args=(deployment_id, db_password)).start()
    
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
            return
        
        log_message(deployment_id, f"Starting SQL deployment for {file_name}")
        
        # Execute SQL file using psql
        # Note: In a production environment, you should use a more secure approach for handling passwords
        cmd = ["psql", "-U", db_user, "-h", "localhost", "-f", source_file]
        
        log_message(deployment_id, f"Executing SQL: {' '.join(cmd)}")
        
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
        else:
            log_message(deployment_id, "ERROR: SQL deployment failed")
            deployments[deployment_id]["status"] = "failed"
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during SQL deployment: {str(e)}")
        deployments[deployment_id]["status"] = "failed"

# API for systemd operations
@app.route('/api/systemd/operation', methods=['POST'])
def systemd_operation():
    data = request.json
    service = data.get('service')
    operation = data.get('operation')
    vms = data.get('vms')
    
    if not all([service, operation, vms]):
        return jsonify({"error": "Missing required parameters"}), 400
    
    if operation not in ['status', 'start', 'stop', 'restart']:
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
    
    # Start systemd operation in a separate thread
    threading.Thread(target=process_systemd_operation, args=(deployment_id,)).start()
    
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
  tasks:
    - name: {operation.capitalize()} {service} service
      ansible.builtin.systemd:
        name: {service}
        state: {"started" if operation == 'start' else "stopped" if operation == 'stop' else "restarted" if operation == 'restart' else ""}
        {"enabled: true" if operation == 'start' else ""}
      become: true
      register: systemd_result
      when: '{operation}' != 'status'
      
    - name: Check {service} service status
      ansible.builtin.command: systemctl status {service}
      become: true
      register: status_result
      changed_when: false
      ignore_errors: true
      
    - name: Log service status
      ansible.builtin.debug:
        var: status_result.stdout_lines
""")
        
        # Generate inventory file for ansible
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        with open(inventory_file, 'w') as f:
            f.write("[systemd_targets]\n")
            for vm_name in vms:
                # Find VM IP from inventory
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm\n")
        
        # Run ansible playbook
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-v"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        for line in process.stdout:
            log_message(deployment_id, line.strip())
        
        process.wait()
        
        if process.returncode == 0:
            log_message(deployment_id, f"SUCCESS: Systemd {operation} operation completed successfully")
            deployments[deployment_id]["status"] = "success"
        else:
            log_message(deployment_id, f"ERROR: Systemd {operation} operation failed")
            deployments[deployment_id]["status"] = "failed"
        
        # Clean up temporary files
        os.remove(playbook_file)
        os.remove(inventory_file)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR: Exception during systemd operation: {str(e)}")
        deployments[deployment_id]["status"] = "failed"

# API to get deployment logs
@app.route('/api/deploy/<deployment_id>/logs')
def get_deployment_logs(deployment_id):
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
                
                # Send completion status - Fix the f-string syntax error here
                status_msg = f"Deployment {deployments[deployment_id]['status']}."
                yield f"data: {json.dumps({'status': deployments[deployment_id]['status'], 'message': status_msg})}\n\n"
            
            return
        
        return Response(generate(), mimetype='text/event-stream')
    else:
        # Return all logs for a deployment
        if deployment_id not in deployments:
            return jsonify({"error": "Deployment not found"}), 404
        
        return jsonify({"logs": deployments[deployment_id]["logs"]})

# API to get deployment history
@app.route('/api/deployments/history')
def get_deployment_history():
    # Sort deployments by timestamp, newest first
    sorted_deployments = sorted(
        [d for d in deployments.values()],
        key=lambda x: x["timestamp"],
        reverse=True
    )
    
    # Convert timestamp to ISO format and remove logs
    for d in sorted_deployments:
        d["timestamp"] = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(d["timestamp"]))
        if "logs" in d:
            del d["logs"]
    
    return jsonify(sorted_deployments)

# Helper function to log messages
def log_message(deployment_id, message):
    print(f"[{deployment_id}] {message}")
    if deployment_id in deployments:
        deployments[deployment_id]["logs"].append(message)

if __name__ == '__main__':
    from waitress import serve
    print("Starting Fix Deployment Orchestrator")
    serve(app, host="0.0.0.0", port=5000)
