
from flask import Blueprint, request, jsonify, current_app, session
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
    return session.get('user')

def log_message(deployment_id, message):
    """Add a log message to the deployment with proper formatting"""
    if deployment_id in active_deployments:
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_entry = f"[{timestamp}] {message}"
        active_deployments[deployment_id]['logs'].append(log_entry)
        logger.info(f"[TEMPLATE-{deployment_id}] {message}")
        
        # Also save to file immediately for persistent logging
        save_log_to_file(deployment_id, log_entry)

def save_log_to_file(deployment_id, log_entry):
    """Save individual log entry to file"""
    try:
        logs_dir = '/app/logs/deployment_templates'
        os.makedirs(logs_dir, exist_ok=True)
        
        log_file = os.path.join(logs_dir, f"{deployment_id}.log")
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(log_entry + '\n')
    except Exception as e:
        logger.error(f"Failed to save log to file for {deployment_id}: {str(e)}")

def save_deployment_to_history(deployment_id, deployment, ft_number):
    """Save deployment logs to main deployment history"""
    try:
        # Import here to avoid circular imports
        import sys
        sys.path.append('/app/backend')
        
        # Load the main deployments dictionary from app.py
        history_file = '/app/logs/deployment_history.json'
        deployments = {}
        
        # Load existing deployments
        if os.path.exists(history_file):
            try:
                with open(history_file, 'r') as f:
                    deployments = json.load(f)
            except json.JSONDecodeError:
                logger.warning("Could not load deployment history, starting fresh")
                deployments = {}
        
        # Create deployment entry for history
        deployment_entry = {
            'id': deployment_id,
            'type': 'template_deployment',
            'ft': ft_number,
            'status': deployment['status'],
            'timestamp': time.time(),
            'logs': deployment['logs'],
            'orchestration_user': 'infadm',
            'logged_in_user': deployment.get('logged_in_user', 'unknown'),
            'user_role': deployment.get('user_role', 'unknown'),
            'template_name': deployment.get('template_name', f'Template_{ft_number}'),
            'operation': 'Template Deployment',
            'details': {
                'template_metadata': deployment.get('template', {}).get('metadata', {}),
                'steps_count': len(deployment.get('template', {}).get('steps', [])),
                'deployment_duration': deployment.get('duration', 0)
            }
        }
        
        # Add to deployments
        deployments[deployment_id] = deployment_entry
        
        # Save back to file
        os.makedirs(os.path.dirname(history_file), exist_ok=True)
        with open(history_file, 'w') as f:
            json.dump(deployments, f, indent=2)
            
        logger.info(f"Successfully saved template deployment {deployment_id} to history")
        
        # Also save individual template deployment log
        template_logs_dir = '/app/logs/deployment_templates'
        os.makedirs(template_logs_dir, exist_ok=True)
        
        template_log_file = os.path.join(template_logs_dir, f"{deployment_id}.json")
        with open(template_log_file, 'w') as f:
            json.dump(deployment_entry, f, indent=2)
            
    except Exception as e:
        logger.exception(f"Failed to save deployment {deployment_id} to history: {str(e)}")

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
        
        log_message(deployment_id, f"=== FILE DEPLOYMENT STEP ===")
        log_message(deployment_id, f"FT Source: {ft_source}")
        log_message(deployment_id, f"Target Path: {target_path}")
        log_message(deployment_id, f"Target User:Group: {target_user}:{target_group}")
        log_message(deployment_id, f"Files to deploy: {', '.join(files)}")
        log_message(deployment_id, f"Target VMs: {', '.join(target_vms)}")
        
        # Generate Ansible playbook for file deployment
        playbook_file = f"/tmp/file_deploy_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Load inventory to get VM details
        inventory_path = '/app/inventory/inventory.json'
        if not os.path.exists(inventory_path):
            log_message(deployment_id, f"ERROR: Inventory file not found: {inventory_path}")
            return False
            
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        # Create inventory file
        log_message(deployment_id, "Creating Ansible inventory...")
        with open(inventory_file, 'w') as f:
            f.write("[file_targets]\n")
            for vm_name in target_vms:
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/home/users/infadm/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\n")
                    log_message(deployment_id, f"Added VM {vm_name} ({vm['ip']}) to inventory")
                else:
                    log_message(deployment_id, f"WARNING: VM {vm_name} not found in inventory")
        
        # Create Ansible playbook with validation and backup
        log_message(deployment_id, "Generating Ansible playbook...")
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Deploy files with validation and backup for {ft_source}
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
    - name: Test connection to target hosts
      ansible.builtin.ping:
      
    - name: Display deployment information
      ansible.builtin.debug:
        msg: "Deploying {{{{ ansible_play_hosts | length }}}} files to {{{{ target_path }}}} on {{{{ inventory_hostname }}}}"
      
    - name: Ensure target directory exists
      ansible.builtin.file:
        path: "{{{{ target_path }}}}"
        state: directory
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: '0755'
      register: dir_result
      
    - name: Log directory creation result
      ansible.builtin.debug:
        msg: "Target directory status: {{{{ 'created' if dir_result.changed else 'already exists' }}}}"
        
""")
            
            for file in files:
                source_file = os.path.join('/app/fixfiles', 'AllFts', ft_source, file)
                
                # Check if source file exists
                if not os.path.exists(source_file):
                    log_message(deployment_id, f"ERROR: Source file not found: {source_file}")
                    return False
                
                # Calculate source file checksum
                source_checksum = calculate_file_checksum(source_file)
                if not source_checksum:
                    log_message(deployment_id, f"ERROR: Could not calculate checksum for {file}")
                    return False
                
                log_message(deployment_id, f"Source file {file} checksum: {source_checksum}")
                
                f.write(f"""
    # Deployment tasks for file: {file}
    - name: Check if {file} exists on target
      ansible.builtin.stat:
        path: "{{{{ target_path }}}}/{file}"
      register: file_stat_{file.replace('.', '_').replace('-', '_')}
      
    - name: Log existing file status for {file}
      ansible.builtin.debug:
        msg: "File {file} {{{{ 'exists' if file_stat_{file.replace('.', '_').replace('-', '_')}.stat.exists else 'does not exist' }}}} on {{{{ inventory_hostname }}}}"
      
    - name: Create backup of existing {file}
      ansible.builtin.copy:
        src: "{{{{ target_path }}}}/{file}"
        dest: "{{{{ target_path }}}}/{file}.backup.{{{{ ansible_date_time.epoch }}}}"
        remote_src: true
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: preserve
      when: file_stat_{file.replace('.', '_').replace('-', '_')}.stat.exists
      register: backup_result_{file.replace('.', '_').replace('-', '_')}
      
    - name: Log backup result for {file}
      ansible.builtin.debug:
        msg: "Backup created: {{{{ backup_result_{file.replace('.', '_').replace('-', '_')}.dest if backup_result_{file.replace('.', '_').replace('-', '_')}.changed else 'No backup needed' }}}}"
      
    - name: Deploy {file} to target
      ansible.builtin.copy:
        src: "{source_file}"
        dest: "{{{{ target_path }}}}/{file}"
        owner: "{{{{ target_user }}}}"
        group: "{{{{ target_group }}}}"
        mode: '0644'
        checksum: "{source_checksum}"
      register: copy_result_{file.replace('.', '_').replace('-', '_')}
      
    - name: Log deployment result for {file}
      ansible.builtin.debug:
        msg: "File {file} {{{{ 'deployed successfully' if copy_result_{file.replace('.', '_').replace('-', '_')}.changed else 'was already up to date' }}}}"
      
    - name: Validate {file} checksum on target
      ansible.builtin.stat:
        path: "{{{{ target_path }}}}/{file}"
        checksum_algorithm: sha256
      register: target_file_stat_{file.replace('.', '_').replace('-', '_')}
      
    - name: Verify {file} checksum matches source
      ansible.builtin.fail:
        msg: "CHECKSUM VALIDATION FAILED for {file}! Expected: {source_checksum}, Got: {{{{ target_file_stat_{file.replace('.', '_').replace('-', '_')}.stat.checksum }}}}"
      when: target_file_stat_{file.replace('.', '_').replace('-', '_')}.stat.checksum != "{source_checksum}"
      
    - name: Confirm successful deployment of {file}
      ansible.builtin.debug:
        msg: "✓ {file} deployed successfully with checksum validation ({{{{ target_user }}}}:{{{{ target_group }}}})"
""")
        
        log_message(deployment_id, "Executing Ansible playbook...")
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"CRITICAL ERROR in file deployment: {str(e)}")
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
        
        log_message(deployment_id, f"=== SQL DEPLOYMENT STEP ===")
        log_message(deployment_id, f"FT Source: {ft_source}")
        log_message(deployment_id, f"Database Connection: {db_connection}")
        log_message(deployment_id, f"Database User: {db_user}")
        log_message(deployment_id, f"SQL Files: {', '.join(files)}")
        
        # Load db_inventory to get connection details
        db_inventory_path = '/app/inventory/db_inventory.json'
        if not os.path.exists(db_inventory_path):
            log_message(deployment_id, f"ERROR: DB inventory file not found: {db_inventory_path}")
            return False
            
        with open(db_inventory_path, 'r') as f:
            db_inventory = json.load(f)
        
        connection_details = next(
            (conn for conn in db_inventory.get('db_connections', []) 
             if conn['db_connection'] == db_connection), None
        )
        
        if not connection_details:
            log_message(deployment_id, f"ERROR: DB connection '{db_connection}' not found in inventory")
            return False
        
        hostname = connection_details['hostname']
        port = connection_details['port']
        db_name = connection_details['db_name']
        
        log_message(deployment_id, f"Connecting to database: {hostname}:{port}/{db_name}")
        
        # Generate Ansible playbook for SQL deployment
        playbook_file = f"/tmp/sql_deploy_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Create localhost inventory for SQL execution
        with open(inventory_file, 'w') as f:
            f.write("[sql_targets]\n")
            f.write("localhost ansible_connection=local\n")
        
        # Decode password if base64 encoded
        decoded_password = db_password
        if db_password:
            try:
                decoded_password = base64.b64decode(db_password).decode('utf-8')
            except Exception:
                decoded_password = db_password  # Use as-is if not base64
        
        # Create Ansible playbook for SQL execution
        log_message(deployment_id, "Generating SQL deployment playbook...")
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Execute SQL files for {ft_source}
  hosts: sql_targets
  gather_facts: false
  vars:
    db_hostname: "{hostname}"
    db_port: "{port}"
    db_name: "{db_name}"
    db_user: "{db_user}"
    db_password: "{decoded_password}"
    ft_source: "{ft_source}"
  tasks:
    - name: Check PostgreSQL client availability
      ansible.builtin.command: which psql
      register: psql_check
      failed_when: false
      
    - name: Fail if psql not available
      ansible.builtin.fail:
        msg: "PostgreSQL client (psql) not found. Please install postgresql-client."
      when: psql_check.rc != 0
      
    - name: Display SQL deployment information
      ansible.builtin.debug:
        msg: "Executing {{{{ {len(files)} }}}} SQL files on {{{{ db_hostname }}}}:{{{{ db_port }}}}/{{{{ db_name }}}}"
      
""")
            
            for sql_file in files:
                source_file = os.path.join('/app/fixfiles', 'AllFts', ft_source, sql_file)
                
                # Check if SQL file exists
                if not os.path.exists(source_file):
                    log_message(deployment_id, f"ERROR: SQL file not found: {source_file}")
                    return False
                
                log_message(deployment_id, f"Preparing to execute SQL file: {sql_file}")
                
                f.write(f"""
    - name: Execute SQL file {sql_file}
      ansible.builtin.shell: |
        export PGPASSWORD="{decoded_password}"
        psql -h "{{{{ db_hostname }}}}" -p "{{{{ db_port }}}}" -d "{{{{ db_name }}}}" -U "{{{{ db_user }}}}" -f "{source_file}" -v ON_ERROR_STOP=1 --echo-queries
      register: sql_result_{sql_file.replace('.', '_').replace('-', '_')}
      environment:
        PGPASSWORD: "{{{{ db_password }}}}"
        
    - name: Display SQL execution output for {sql_file}
      ansible.builtin.debug:
        msg: 
          - "SQL File: {sql_file}"
          - "Exit Code: {{{{ sql_result_{sql_file.replace('.', '_').replace('-', '_')}.rc }}}}"
          - "Output Lines: {{{{ sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stdout_lines | length }}}}"
        
    - name: Show SQL execution results for {sql_file}
      ansible.builtin.debug:
        var: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stdout_lines
      when: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stdout_lines is defined
        
    - name: Show SQL execution errors for {sql_file}
      ansible.builtin.debug:
        var: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines
      when: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines is defined and sql_result_{sql_file.replace('.', '_').replace('-', '_')}.stderr_lines | length > 0
      
    - name: Confirm SQL file execution
      ansible.builtin.debug:
        msg: "✓ SQL file {sql_file} executed successfully"
      when: sql_result_{sql_file.replace('.', '_').replace('-', '_')}.rc == 0
""")
        
        log_message(deployment_id, "Executing SQL deployment...")
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"CRITICAL ERROR in SQL deployment: {str(e)}")
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
        
        log_message(deployment_id, f"=== SERVICE MANAGEMENT STEP ===")
        log_message(deployment_id, f"Service: {service}")
        log_message(deployment_id, f"Operation: {operation}")
        log_message(deployment_id, f"Target VMs: {', '.join(target_vms)}")
        
        # Generate Ansible playbook
        playbook_file = f"/tmp/service_{deployment_id}.yml"
        inventory_file = f"/tmp/inventory_{deployment_id}"
        
        # Load inventory to get VM details
        inventory_path = '/app/inventory/inventory.json'
        if not os.path.exists(inventory_path):
            log_message(deployment_id, f"ERROR: Inventory file not found: {inventory_path}")
            return False
            
        with open(inventory_path, 'r') as f:
            inventory = json.load(f)
        
        # Create inventory file
        log_message(deployment_id, "Creating service management inventory...")
        with open(inventory_file, 'w') as f:
            f.write("[service_targets]\n")
            for vm_name in target_vms:
                vm = next((v for v in inventory["vms"] if v["name"] == vm_name), None)
                if vm:
                    f.write(f"{vm_name} ansible_host={vm['ip']} ansible_user=infadm ansible_ssh_private_key_file=/home/users/infadm/.ssh/id_rsa ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\n")
                    log_message(deployment_id, f"Added VM {vm_name} ({vm['ip']}) for service management")
                else:
                    log_message(deployment_id, f"WARNING: VM {vm_name} not found in inventory")
        
        # Create Ansible playbook
        log_message(deployment_id, "Generating service management playbook...")
        with open(playbook_file, 'w') as f:
            f.write(f"""---
- name: Service {operation} operation for {service}
  hosts: service_targets
  gather_facts: false
  become: true
  vars:
    service_name: "{service}"
    service_operation: "{operation}"
  tasks:
    - name: Display service operation information
      ansible.builtin.debug:
        msg: "Performing {{{{ service_operation }}}} on service {{{{ service_name }}}} on {{{{ inventory_hostname }}}}"
    
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
      
    - name: Display service operation result
      ansible.builtin.debug:
        msg: "✓ Service {{{{ service_name }}}} {{{{ service_operation }}}} completed successfully on {{{{ inventory_hostname }}}}"
      when: service_operation != 'status' and service_result is succeeded
      
    - name: Display service status information
      ansible.builtin.debug:
        msg: 
          - "Service: {{{{ service_name }}}}"
          - "Status: {{{{ service_status.status.ActiveState if service_status.status is defined else 'unknown' }}}}"
          - "Enabled: {{{{ service_status.status.UnitFileState if service_status.status is defined else 'unknown' }}}}"
      when: service_operation == 'status'
""")
        
        log_message(deployment_id, f"Executing service {operation} operation...")
        # Execute Ansible playbook
        return execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id)
        
    except Exception as e:
        log_message(deployment_id, f"CRITICAL ERROR in service management: {str(e)}")
        logger.exception(f"Exception in service operation {deployment_id}: {str(e)}")
        return False

def execute_ansible_playbook_file(playbook_file, inventory_file, deployment_id):
    """Execute an Ansible playbook file and capture detailed output"""
    try:
        # Ensure control path directory exists
        os.makedirs('/tmp/ansible-ssh', exist_ok=True)
        
        # Set up environment
        env_vars = os.environ.copy()
        env_vars["ANSIBLE_CONFIG"] = "/etc/ansible/ansible.cfg"
        env_vars["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env_vars["ANSIBLE_SSH_CONTROL_PATH"] = "/tmp/ansible-ssh/%h-%p-%r"
        env_vars["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/tmp/ansible-ssh"
        env_vars["ANSIBLE_STDOUT_CALLBACK"] = "default"
        env_vars["ANSIBLE_FORCE_COLOR"] = "false"
        
        cmd = ["ansible-playbook", "-i", inventory_file, playbook_file, "-vv"]
        
        log_message(deployment_id, f"Executing command: {' '.join(cmd)}")
        logger.info(f"Executing Ansible command for {deployment_id}: {' '.join(cmd)}")
        
        # Use Popen for real-time output capture
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env_vars,
            bufsize=1,
            universal_newlines=True
        )
        
        # Read and log output in real-time
        output_lines = []
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                cleaned_output = output.strip()
                if cleaned_output:  # Only log non-empty lines
                    log_message(deployment_id, cleaned_output)
                    output_lines.append(cleaned_output)
        
        rc = process.poll()
        
        # Clean up temporary files
        try:
            if os.path.exists(playbook_file):
                os.remove(playbook_file)
            if os.path.exists(inventory_file):
                os.remove(inventory_file)
            log_message(deployment_id, "Cleaned up temporary Ansible files")
        except Exception as e:
            log_message(deployment_id, f"Warning: Could not clean up temporary files: {str(e)}")
        
        if rc == 0:
            log_message(deployment_id, "✅ Ansible playbook executed successfully")
            return True
        else:
            log_message(deployment_id, f"❌ Ansible playbook failed with return code: {rc}")
            return False
            
    except Exception as e:
        log_message(deployment_id, f"CRITICAL ERROR executing Ansible playbook: {str(e)}")
        logger.exception(f"Exception in playbook execution {deployment_id}: {str(e)}")
        return False

def execute_deployment_step(step, deployment_id, ft_number):
    """Execute a single deployment step using appropriate method"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return False
    
    try:
        step_type = step.get('type')
        step_description = step.get('description', f"{step_type} operation")
        step_order = step.get('order', 0)
        
        log_message(deployment_id, f"{'='*50}")
        log_message(deployment_id, f"EXECUTING STEP {step_order}: {step_description}")
        log_message(deployment_id, f"Step Type: {step_type}")
        log_message(deployment_id, f"{'='*50}")
        
        start_time = time.time()
        
        if step_type == 'file_deployment':
            success = execute_ansible_file_deployment(step, deployment_id, ft_number)
        elif step_type == 'sql_deployment':
            success = execute_ansible_sql_deployment(step, deployment_id, ft_number)
        elif step_type == 'service_restart':
            success = execute_ansible_service_restart(step, deployment_id)
        elif step_type == 'ansible_playbook':
            log_message(deployment_id, "Ansible playbook execution not yet implemented")
            success = False
        elif step_type == 'helm_upgrade':
            log_message(deployment_id, "Helm upgrade execution not yet implemented")
            success = False
        else:
            log_message(deployment_id, f"ERROR: Unknown step type: {step_type}")
            success = False
        
        duration = time.time() - start_time
        
        if success:
            log_message(deployment_id, f"✅ STEP {step_order} COMPLETED SUCCESSFULLY (Duration: {duration:.2f}s)")
        else:
            log_message(deployment_id, f"❌ STEP {step_order} FAILED (Duration: {duration:.2f}s)")
            
        return success
            
    except Exception as e:
        log_message(deployment_id, f"CRITICAL ERROR in step {step.get('order', 'unknown')}: {str(e)}")
        logger.exception(f"Exception in step execution {deployment_id}: {str(e)}")
        return False

def run_template_deployment(deployment_id, template, ft_number):
    """Run the template deployment in a separate thread with comprehensive logging"""
    deployment = active_deployments.get(deployment_id)
    if not deployment:
        return
    
    start_time = time.time()
    
    try:
        deployment['status'] = 'running'
        
        log_message(deployment_id, "🚀 TEMPLATE DEPLOYMENT STARTED")
        log_message(deployment_id, f"Deployment ID: {deployment_id}")
        log_message(deployment_id, f"FT Number: {ft_number}")
        log_message(deployment_id, f"Template Name: {template.get('metadata', {}).get('ft_number', 'Unknown')}")
        log_message(deployment_id, f"Started by: {deployment.get('logged_in_user', 'unknown')}")
        
        steps = template.get('steps', [])
        total_steps = len(steps)
        
        log_message(deployment_id, f"Total deployment steps: {total_steps}")
        
        # Log template metadata
        metadata = template.get('metadata', {})
        if metadata.get('selectedVMs'):
            log_message(deployment_id, f"Target VMs: {', '.join(metadata['selectedVMs'])}")
        if metadata.get('selectedFiles'):
            log_message(deployment_id, f"Files to deploy: {', '.join(metadata['selectedFiles'])}")
        if metadata.get('targetUser'):
            log_message(deployment_id, f"Target user: {metadata['targetUser']}")
        
        log_message(deployment_id, "=" * 60)
        
        # Execute steps in order
        successful_steps = 0
        failed_steps = 0
        
        for step in sorted(steps, key=lambda x: x.get('order', 0)):
            if deployment['status'] != 'running':
                log_message(deployment_id, "⚠️ Deployment interrupted by user or system")
                break
                
            step_success = execute_deployment_step(step, deployment_id, ft_number)
            
            if step_success:
                successful_steps += 1
                log_message(deployment_id, f"Step {step.get('order')} completed successfully")
            else:
                failed_steps += 1
                deployment['status'] = 'failed'
                log_message(deployment_id, f"❌ DEPLOYMENT FAILED at step {step.get('order')}")
                log_message(deployment_id, f"Steps completed: {successful_steps}/{total_steps}")
                break
        
        # Calculate final results
        total_duration = time.time() - start_time
        deployment['duration'] = total_duration
        
        if deployment['status'] == 'running':
            deployment['status'] = 'success'
            log_message(deployment_id, "=" * 60)
            log_message(deployment_id, "🎉 TEMPLATE DEPLOYMENT COMPLETED SUCCESSFULLY!")
            log_message(deployment_id, f"Total steps executed: {successful_steps}/{total_steps}")
            log_message(deployment_id, f"Total deployment time: {total_duration:.2f} seconds")
            log_message(deployment_id, f"FT {ft_number} has been deployed successfully")
        else:
            log_message(deployment_id, "=" * 60)
            log_message(deployment_id, "💥 TEMPLATE DEPLOYMENT FAILED!")
            log_message(deployment_id, f"Successful steps: {successful_steps}/{total_steps}")
            log_message(deployment_id, f"Failed steps: {failed_steps}")
            log_message(deployment_id, f"Deployment duration: {total_duration:.2f} seconds")
        
        # Save deployment to history
        save_deployment_to_history(deployment_id, deployment, ft_number)
        
    except Exception as e:
        total_duration = time.time() - start_time
        deployment['status'] = 'failed'
        deployment['duration'] = total_duration
        
        log_message(deployment_id, "💥 CRITICAL ERROR IN TEMPLATE DEPLOYMENT")
        log_message(deployment_id, f"Error: {str(e)}")
        log_message(deployment_id, f"Deployment duration: {total_duration:.2f} seconds")
        
        logger.exception(f"Critical exception in template deployment {deployment_id}: {str(e)}")
        save_deployment_to_history(deployment_id, deployment, ft_number)

@deploy_template_bp.route('/api/deploy/template', methods=['POST'])
def deploy_template():
    """Start a template deployment with enhanced logging"""
    try:
        # Get current authenticated user
        current_user = get_current_user()
        if not current_user:
            logger.warning("Template deployment attempted without authentication")
            return jsonify({'error': 'Authentication required'}), 401
        
        data = request.get_json()
        ft_number = data.get('ft_number')
        template = data.get('template')
        
        if not ft_number or not template:
            logger.warning(f"Template deployment request missing data: ft_number={ft_number}, template_present={template is not None}")
            return jsonify({'error': 'Missing ft_number or template'}), 400
        
        # Generate deployment ID
        deployment_id = str(uuid.uuid4())
        
        # Initialize deployment tracking
        active_deployments[deployment_id] = {
            'id': deployment_id,
            'ft_number': ft_number,
            'status': 'initializing',
            'logs': [],
            'started_at': datetime.now().isoformat(),
            'template': template,
            'logged_in_user': current_user['username'],
            'user_role': current_user['role'],
            'template_name': template.get('metadata', {}).get('ft_number', f'Template_{ft_number}')
        }
        
        logger.info(f"Template deployment initiated: ID={deployment_id}, FT={ft_number}, User={current_user['username']}")
        
        # Start deployment in background thread
        deployment_thread = threading.Thread(
            target=run_template_deployment,
            args=(deployment_id, template, ft_number),
            daemon=True,
            name=f"TemplateDeployment-{deployment_id[:8]}"
        )
        deployment_thread.start()
        
        return jsonify({
            'deploymentId': deployment_id,
            'message': f'Template deployment started for {ft_number}',
            'status': 'initializing',
            'initiatedBy': current_user['username'],
            'ftNumber': ft_number,
            'templateName': template.get('metadata', {}).get('ft_number', f'Template_{ft_number}')
        })
        
    except Exception as e:
        logger.exception(f"Critical error in deploy_template endpoint: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e),
            'type': type(e).__name__
        }), 500

@deploy_template_bp.route('/api/deploy/template/<deployment_id>/logs', methods=['GET'])
def get_deployment_logs(deployment_id):
    """Get logs for a template deployment with enhanced status reporting"""
    try:
        deployment = active_deployments.get(deployment_id)
        
        if not deployment:
            # Check if deployment is in completed deployments or file system
            try:
                # Try to load from template deployment logs
                template_log_file = f'/app/logs/deployment_templates/{deployment_id}.json'
                if os.path.exists(template_log_file):
                    with open(template_log_file, 'r') as f:
                        completed_deployment = json.load(f)
                    return jsonify({
                        'logs': completed_deployment.get('logs', []),
                        'status': completed_deployment.get('status', 'unknown'),
                        'ft_number': completed_deployment.get('ft', ''),
                        'started_at': completed_deployment.get('timestamp', time.time()),
                        'deployment_id': deployment_id,
                        'completed': True
                    })
                
                # Try to load from main deployment history
                history_file = '/app/logs/deployment_history.json'
                if os.path.exists(history_file):
                    with open(history_file, 'r') as f:
                        all_deployments = json.load(f)
                    
                    if deployment_id in all_deployments:
                        completed_deployment = all_deployments[deployment_id]
                        return jsonify({
                            'logs': completed_deployment.get('logs', []),
                            'status': completed_deployment.get('status', 'unknown'),
                            'ft_number': completed_deployment.get('ft', ''),
                            'started_at': completed_deployment.get('timestamp', time.time()),
                            'deployment_id': deployment_id,
                            'completed': True
                        })
                        
            except Exception as e:
                logger.error(f"Error loading completed deployment {deployment_id}: {str(e)}")
            
            logger.warning(f"Deployment {deployment_id} not found in active or completed deployments")
            return jsonify({'error': 'Deployment not found'}), 404
        
        # Return current deployment status
        response_data = {
            'logs': deployment.get('logs', []),
            'status': deployment.get('status', 'unknown'),
            'ft_number': deployment.get('ft_number', ''),
            'started_at': deployment.get('started_at', ''),
            'deployment_id': deployment_id,
            'template_name': deployment.get('template_name', ''),
            'initiated_by': deployment.get('logged_in_user', 'unknown'),
            'duration': deployment.get('duration', 0),
            'completed': deployment.get('status') in ['success', 'failed']
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.exception(f"Error getting deployment logs for {deployment_id}: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e),
            'deployment_id': deployment_id
        }), 500

# Keep existing inventory API endpoints
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
