from flask import Blueprint, request, jsonify, current_app
import json
import os
import uuid
import threading
import time
from datetime import datetime
import subprocess
import logging
import base64
import hashlib

deploy_template_bp = Blueprint('deploy_template', __name__)

# Get logger
logger = logging.getLogger('fix_deployment_orchestrator')

# Store active deployments
active_deployments = {}

def get_current_user():
    """Get current authenticated user from session"""
    from flask import session
    return session.get('user')

def log_message(deployment_id, message):
    """Add a log message to the deployment"""
    if deployment_id in active_deployments:
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_entry = f"[{timestamp}] {message}"
        active_deployments[deployment_id]['logs'].append(log_entry)
        logger.info(f"[{deployment_id}] {message}")
        
        # Also save to file immediately for persistent logging
        save_log_to_file(deployment_id, log_entry)

def save_log_to_file(deployment_id, log_entry):
    """Save individual log entry to file"""
    try:
        logs_dir = '/app/logs/deployment_templates'
        os.makedirs(logs_dir, exist_ok=True)
        
        log_file = os.path.join(logs_dir, f"{deployment_id}.log")
        with open(log_file, 'a') as f:
            f.write(log_entry + '\n')
    except Exception as e:
        logger.error(f"Failed to save log to file for {deployment_id}: {str(e)}")

def calculate_file_checksum(file_path):
    """Calculate SHA256 checksum of a file"""
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        logger.error(f"Error calculating checksum for {file_path}: {str(e)}")
        return None

def get_user_group_for_target(target_user):
    """Get appropriate group for target user based on user type"""
    if target_user == 'root':
        return 'root'
    elif target_user in ['infadm', 'abpwrk1', 'admin']:
        return 'aimsys'
    else:
        return target_user

def execute_ansible_file_deployment(step, deployment_id, ft_number):
    """Execute file deployment using Ansible with validation and backup"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return False
    
    try:
        files = step.get('files', [])
        target_path = step.get('targetPath', '/home/users/abpwrk1/pbin/app')
        target_user = step.get('targetUser', 'abpwrk1')
        target_group = get_user_group_for_target(target_user)
        target_vms = step.get('targetVMs', [])
        ft_source = step.get('ftNumber', ft_number)
        
        log_message(deployment_id, f"Starting Ansible file deployment for FT {ft_source}")
        log_message(deployment_id, f"Target: {target_user}:{target_group} at {target_path}")
        log_message(deployment_id, f"Files: {', '.join(files)}")
        log_message(deployment_id, f"VMs: {', '.join(target_vms)}")
        
        for file in files:
            log_message(deployment_id, f"Copying {file} from FT {ft_source} to {', '.join(target_vms)}:{target_path} as {target_user}")
        
        # Generate Ansible playbook for file deployment
        playbook_file = f"/tmp/file_deploy_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Load inventory to get VM details
        inventory_path = '/app/inventory/inventory.json'
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        # Create inventory file
        with open(inventory_file, 'w') as f:
            f.write("[file_targets]\n")
            for vm_name in target_vms:
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/home/users/infadm/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\n")
        
        # Create Ansible playbook with validation and backup
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Deploy files with validation and backup
  hosts: file_targets
  gather_facts: true
  become: true
  vars:
    target_path: "{target_path}"
    target_user: "{target_user}"
    target_group: "{target_group}"
    ft_source: "{ft_source}"
    deployment_id: "{deployment_id}"
  tasks:
    - name: Test connection
      ansible.builtin.ping:
      
    - name: Ensure target directory exists
      ansible.builtin.file:
        path: "{{{{ target_path }}}}"
        state: directory
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: '0755'
        
""")
            
            for file in files:
                source_file = os.path.join('/app/fixfiles', 'AllFts', ft_source, file)
                
                # Calculate source file checksum
                source_checksum = calculate_file_checksum(source_file)
                if not source_checksum:
                    log_message(deployment_id, f"ERROR: Could not calculate checksum for {file}")
                    return False
                
                log_message(deployment_id, f"Source checksum for {file}: {source_checksum}")
                
                f.write(f"""
    # Tasks for file: {file}
    - name: Check if {file} exists on target
      ansible.builtin.stat:
        path: "{{{{ target_path }}}}/{file}"
      register: file_stat_{file.replace('.', '_').replace('-', '_')}
      
    - name: Create backup of existing {file}
      ansible.builtin.copy:
        src: "{{{{ target_path }}}}/{file}"
        dest: "{{{{ target_path }}}}/{file}.backup.{{{{ ansible_date_time.epoch }}}}"
        remote_src: true
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: preserve
      when: file_stat_{file.replace('.', '_').replace('-', '_')}.stat.exists
      
    - name: Copy {file} to target
      ansible.builtin.copy:
        src: "{source_file}"
        dest: "{{{{ target_path }}}}/{file}"
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: '0644'
        checksum: "{source_checksum}"
      register: copy_result_{file.replace('.', '_').replace('-', '_')}
      
    - name: Validate {file} checksum
      ansible.builtin.stat:
        path: "{{{{ target_path }}}}/{file}"
        checksum_algorithm: sha256
      register: target_file_stat_{file.replace('.', '_').replace('-', '_')}
      
    - name: Verify {file} checksum matches
      ansible.builtin.fail:
        msg: "Checksum validation failed for {file}. Expected: {source_checksum}, Got: {{{{ target_file_stat_{file.replace('.', '_').replace('-', '_')}.stat.checksum }}}}"
      when: target_file_stat_{file.replace('.', '_').replace('-', '_')}.stat.checksum != "{source_checksum}"
      
    - name: Verify {file} ownership and permissions
      ansible.builtin.file:
        path: "{{{{ target_path }}}}/{file}"
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: '0644'
        
    - name: Log successful deployment of {file}
      ansible.builtin.debug:
        msg: "Successfully deployed {file} with checksum validation and proper ownership ({{{{ target_user }}}}:{{{{ target_group }}}})"
""")
        
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR in Ansible file deployment: {str(e)}")
        logger.exception(f"Exception in file deployment {deployment_id}: {str(e)}")
        return False

def execute_ansible_sql_deployment(step, deployment_id, ft_number):
    """Execute SQL deployment using Ansible"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return False
    
    try:
        files = step.get('files', [])
        db_connection = step.get('dbConnection')
        db_user = step.get('dbUser')
        db_password = step.get('dbPassword', '')
        ft_source = step.get('ftNumber', ft_number)
        
        log_message(deployment_id, f"Starting Ansible SQL deployment for FT {ft_source}")
        log_message(deployment_id, f"Database: {db_connection}, User: {db_user}")
        log_message(deployment_id, f"SQL Files: {', '.join(files)}")
        
        # Load db_inventory to get connection details
        db_inventory_path = '/app/inventory/db_inventory.json'
        with open(db_inventory_path, 'r') as f:
            db_inventory = json.load(f)
        
        connection_details = next(
            (conn for conn in db_inventory.get('db_connections', []) 
             if conn['db_connection'] == db_connection), None
        )
        
        if not connection_details:
            log_message(deployment_id, f"ERROR: DB connection '{db_connection}' not found")
            return False
        
        hostname = connection_details['hostname']
        port = connection_details['port']
        db_name = connection_details['db_name']
        
        log_message(deployment_id, f"Connecting to {hostname}:{port}/{db_name}")
        
        # Generate Ansible playbook for SQL deployment
        playbook_file = f"/tmp/sql_deploy_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Create localhost inventory for SQL execution
        with open(inventory_file, 'w') as f:
            f.write("[sql_targets]\n")
            f.write("localhost ansible_connection=local\n")
        
        # Create Ansible playbook for SQL execution
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Execute SQL files
  hosts: sql_targets
  gather_facts: false
  vars:
    db_hostname: "{hostname}"
    db_port: "{port}"
    db_name: "{db_name}"
    db_user: "{db_user}"
    db_password: "{db_password}"
    ft_source: "{ft_source}"
  tasks:
    - name: Check if psql is available
      ansible.builtin.command: which psql
      register: psql_check
      failed_when: false
      
    - name: Fail if psql not found
      ansible.builtin.fail:
        msg: "PostgreSQL client (psql) not found. Please install postgresql-client."
      when: psql_check.rc != 0
      
""")
            
            for sql_file in files:
                source_file = os.path.join('/app/fixfiles', 'AllFts', ft_source, sql_file)
                f.write(f"""
    - name: Execute SQL file {sql_file}
      ansible.builtin.shell: |
        export PGPASSWORD="{db_password}"
        psql -h "{{{{ db_hostname }}}}" -p "{{{{ db_port }}}}" -d "{{{{ db_name }}}}" -U "{{{{ db_user }}}}" -f "{source_file}" -v ON_ERROR_STOP=1
      register: sql_result_{sql_file.replace('.', '_').replace('-', '_')}
      environment:
        PGPASSWORD: "{{{{ db_password }}}}"
        
    - name: Log SQL execution result for {sql_file}
      ansible.builtin.debug:
        var: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stdout_lines
        
    - name: Log SQL execution errors for {sql_file}
      ansible.builtin.debug:
        var: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines
      when: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines is defined and sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines | length > 0
""")
        
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR in Ansible SQL deployment: {str(e)}")
        logger.exception(f"Exception in SQL deployment {deployment_id}: {str(e)}")
        return False

def execute_ansible_service_restart(step, deployment_id):
    """Execute service restart using Ansible"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return False
    
    try:
        service = step.get('service', 'docker.service')
        operation = step.get('operation', 'restart')
        target_vms = step.get('targetVMs', [])
        
        log_message(deployment_id, f"Starting Ansible service {operation} for {service}")
        log_message(deployment_id, f"Target VMs: {', '.join(target_vms)}")
        
        # Generate Ansible playbook
        playbook_file = f"/tmp/service_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Load inventory to get VM details
        inventory_path = '/app/inventory/inventory.json'
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        # Create inventory file
        with open(inventory_file, 'w') as f:
            f.write("[service_targets]\n")
            for vm_name in target_vms:
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/home/users/infadm/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\n")
        
        # Create Ansible playbook
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Service {operation} operation
  hosts: service_targets
  gather_facts: false
  become: true
  vars:
    service_name: "{service}"
    service_operation: "{operation}"
  tasks:
    - name: Execute service {operation}
      ansible.builtin.systemd:
        name: "{{{{ service_name }}}}"
        state: "{{{{ 'started' if service_operation == 'start' else 'stopped' if service_operation == 'stop' else 'restarted' if service_operation == 'restart' else service_operation }}}}"
        enabled: "{{{{ true if service_operation == 'enable' else false if service_operation == 'disable' else omit }}}}"
      register: service_result
      when: service_operation in ['start', 'stop', 'restart', 'enable', 'disable']
      
    - name: Get service status
      ansible.builtin.systemd:
        name: "{{{{ service_name }}}}"
      register: service_status
      when: service_operation == 'status'
      
    - name: Log service operation result
      ansible.builtin.debug:
        msg: "Service {{{{ service_name }}}} {{{{ service_operation }}}} completed successfully"
      when: service_operation != 'status'
      
    - name: Log service status
      ansible.builtin.debug:
        var: service_status
      when: service_operation == 'status'
""")
        
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"ERROR in Ansible service operation: {str(e)}")
        logger.exception(f"Exception in service operation {deployment_id}: {str(e)}")
        return False

def execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id):
    """Execute an Ansible playbook file and capture output"""
    try:
        # Ensure control path directory exists
        os.makedirs('/tmp/ansible-ssh', exist_ok=True)
        
        # Set up environment
        env_vars = os.environ.copy()
        env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
        env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
        env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
        
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-vvv"]
        
        log_message(deployment_id, f"Executing: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command: {' '.join(cmd)}")
        
        # Use Popen for real-time output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env_vars,
            bufsize=1,
            universal_newlines=True
        )
        
        # Read output in real-time
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                log_message(deployment_id, output.strip())
        
        rc = process.poll()
        
        # Clean up temporary files
        try:
            os.remove(playbook_file)
            os.remove(inventory_file)
        except Exception as e:
            log_message(deployment_id, f"Warning: Could not clean up temporary files: {str(e)}")
        
        if rc == 0:
            log_message(deployment_id, "SUCCESS: Ansible playbook executed successfully")
            return True
        else:
            log_message(deployment_id, f"ERROR: Ansible playbook failed with return code: {rc}")
            return False
            
    except Exception as e:
        log_message(deployment_id, f"ERROR executing Ansible playbook: {str(e)}")
        logger.exception(f"Exception in playbook execution {deployment_id}: {str(e)}")
        return False

def execute_deployment_step(step, deployment_id, ft_number, orchestration_user='infadm'):
    """Execute a single deployment step using Ansible"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return False
    
    try:
        step_type = step.get('type')
        step_description = step.get('description', f"{step_type} operation")
        log_message(deployment_id, f"Executing step {step.get('order')}: {step_description}")
        
        if step_type == 'file_deployment':
            return execute_ansible_file_deployment(step, deployment_id, ft_number)
        elif step_type == 'sql_deployment':
            return execute_ansible_sql_deployment(step, deployment_id, ft_number)
        elif step_type == 'service_restart':
            return execute_ansible_service_restart(step, deployment_id)
        elif step_type == 'ansible_playbook':
            return execute_ansible_playbook(step, deployment_id)
        elif step_type == 'helm_upgrade':
            return execute_helm_upgrade(step, deployment_id)
        else:
            log_message(deployment_id, f"ERROR: Unknown step type: {step_type}")
            return False
            
    except Exception as e:
        log_message(deployment_id, f"ERROR in step {step.get('order')}: {str(e)}")
        logger.exception(f"Exception in step execution {deployment_id}: {str(e)}")
        return False

def run_template_deployment(deployment_id, template, ft_number):
    """Run the template deployment in a separate thread"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return
    
    try:
        deployment['status'] = 'running'
        log_message(deployment_id, f"Starting template deployment for {ft_number}")
        
        steps = template.get('steps', [])
        total_steps = len(steps)
        
        log_message(deployment_id, f"Total steps to execute: {total_steps}")
        
        # Execute steps in order
        for step in sorted(steps, key=lambda x: x.get('order', 0)):
            if deployment['status'] != 'running':
                break
                
            step_description = step.get('description', f"{step.get('type')} operation")
            log_message(deployment_id, f"Step {step.get('order')} started: {step_description}")
            success = execute_deployment_step(step, deployment_id, ft_number)
            
            if success:
                log_message(deployment_id, f"Step {step.get('order')} completed successfully")
            else:
                deployment['status'] = 'failed'
                log_message(deployment_id, f"Deployment failed at step {step.get('order')}")
                save_deployment_logs(deployment_id, deployment, ft_number)
                return
        
        deployment['status'] = 'success'
        log_message(deployment_id, f"Template deployment completed successfully")
        
        # Save logs to deployment history
        save_deployment_logs(deployment_id, deployment, ft_number)
        
    except Exception as e:
        deployment['status'] = 'failed'
        log_message(deployment_id, f"ERROR: {str(e)}")
        logger.exception(f"Exception in template deployment {deployment_id}: {str(e)}")
        save_deployment_logs(deployment_id, deployment, ft_number)

def save_deployment_logs(deployment_id, deployment, ft_number):
    """Save deployment logs to deployment history"""
    try:
        # Import here to avoid circular imports
        from app import deployments, save_deployment_history
        
        # Add to main deployments dictionary for history display
        deployments[deployment_id] = {
            'id': deployment_id,
            'type': 'template_deployment',
            'ft': ft_number,
            'status': deployment['status'],
            'timestamp': time.time(),
            'logs': deployment['logs'],
            'orchestration_user': 'infadm',
            'logged_in_user': deployment.get('logged_in_user', 'unknown'),
            'user_role': deployment.get('user_role', 'unknown'),
            'template_name': deployment.get('template_name', 'Unknown Template')
        }
        
        # Save to file
        save_deployment_history()
        
        # Also save to separate template deployment logs directory
        logs_dir = '/app/logs/deployment_templates'
        os.makedirs(logs_dir, exist_ok=True)
        
        log_entry = {
            'deployment_id': deployment_id,
            'ft_number': ft_number,
            'operation': 'template_deployment',
            'timestamp': deployment['started_at'],
            'status': deployment['status'],
            'logs': deployment['logs'],
            'orchestration_user': 'infadm',
            'logged_in_user': deployment.get('logged_in_user', 'unknown'),
            'template_name': deployment.get('template_name', 'Unknown Template')
        }
        
        log_file = os.path.join(logs_dir, f"{deployment_id}.json")
        with open(log_file, 'w') as f:
            json.dump(log_entry, f, indent=2)
            
        logger.info(f"Saved deployment logs for {deployment_id} to history")
            
    except Exception as e:
        logger.exception(f"Failed to save deployment logs for {deployment_id}: {str(e)}")

@deploy_template_bp.route('/api/deploy/template', methods=['POST'])
def deploy_template():
    """Start a template deployment"""
    try:
        # Get current authenticated user
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        ft_number = data.get('ft_number')
        template = data.get('template')
        
        if not ft_number or not template:
            return jsonify({'error': 'Missing ft_number or template'}), 400
        
        # Generate deployment ID
        deployment_id = str(uuid.uuid4())
        
        # Initialize deployment tracking
        active_deployments[deployment_id] = {
            'id': deployment_id,
            'ft_number': ft_number,
            'status': 'running',
            'logs': [],
            'started_at': datetime.now().isoformat(),
            'template': template,
            'logged_in_user': current_user['username'],
            'user_role': current_user['role'],
            'template_name': template.get('metadata', {}).get('ft_number', 'Unknown Template')
        }
        
        logger.info(f"Template deployment initiated by {current_user['username']} with ID: {deployment_id}")
        
        # Start deployment in background thread
        deployment_thread = threading.Thread(
            target=run_template_deployment,
            args=(deployment_id, template, ft_number),
            daemon=True
        )
        deployment_thread.start()
        
        return jsonify({
            'deploymentId': deployment_id,
            'message': 'Template deployment started',
            'status': 'running',
            'initiatedBy': current_user['username']
        })
        
    except Exception as e:
        logger.exception(f"Error in deploy_template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@deploy_template_bp.route('/api/deploy/template/<deployment_id>/logs', methods=['GET'])
def get_deployment_logs(deployment_id):
    """Get logs for a template deployment"""
    try:
        deployment = active_deployments.get(deployment_id)
        
        if not deployment:
            # Check if deployment is in main deployments (completed)
            try:
                from app import deployments
                if deployment_id in deployments:
                    completed_deployment = deployments[deployment_id]
                    return jsonify({
                        'logs': completed_deployment.get('logs', []),
                        'status': completed_deployment.get('status', 'unknown'),
                        'ft_number': completed_deployment.get('ft', ''),
                        'started_at': completed_deployment.get('timestamp', time.time())
                    })
            except ImportError:
                pass
            return jsonify({'error': 'Deployment not found'}), 404
        
        return jsonify({
            'logs': deployment['logs'],
            'status': deployment['status'],
            'ft_number': deployment['ft_number'],
            'started_at': deployment['started_at']
        })
        
    except Exception as e:
        logger.exception(f"Error getting deployment logs for {deployment_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Inventory API endpoints that were referenced in the template generator
@deploy_template_bp.route('/api/playbooks', methods=['GET'])
def get_playbooks():
    """Get playbooks from inventory"""
    try:
        inventory_path = '/app/inventory/inventory.json'
        
        if not os.path.exists(inventory_path):
            return jsonify({'playbooks': []})
        
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        return jsonify({'playbooks': inventory.get('playbooks', [])})
        
    except Exception as e:
        logger.exception(f"Error getting playbooks: {str(e)}")
        return jsonify({'error': str(e)}), 500

@deploy_template_bp.route('/api/helm-upgrades', methods=['GET'])
def get_helm_upgrades():
    """Get helm upgrades from inventory"""
    try:
        inventory_path = '/app/inventory/inventory.json'
        
        if not os.path.exists(inventory_path):
            return jsonify({'helm_upgrades': []})
        
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        return jsonify({'helm_upgrades': inventory.get('helm_upgrades', [])})
        
    except Exception as e:
        logger.exception(f"Error getting helm upgrades: {str(e)}")
        return jsonify({'error': str(e)}), 500

@deploy_template_bp.route('/api/db-inventory', methods=['GET'])
def get_db_inventory():
    """Get database inventory"""
    try:
        db_inventory_path = '/app/inventory/db_inventory.json'
        
        if not os.path.exists(db_inventory_path):
            return jsonify({'db_connections': [], 'db_users': []})
        
        with open(db_inventory_path, 'r') as f:
            db_inventory = json.load(f)
        
        return jsonify(db_inventory)
        
    except Exception as e:
        logger.exception(f"Error getting db inventory: {str(e)}")
        return jsonify({'error': str(e)}), 500
