
#!/bin/bash
# SSH key setup
if [ -d "/app/ssh-keys" ]; then
  echo "Setting up SSH keys..."
  mkdir -p /root/.ssh
  cp /app/ssh-keys/* /root/.ssh/
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/*
  chown -R root:root /root/.ssh
  echo "SSH keys setup complete"
  
  # Display SSH key fingerprints for debugging
  if [ -f "/root/.ssh/id_rsa" ]; then
    echo "SSH key fingerprints:"
    ssh-keygen -l -f /root/.ssh/id_rsa
  fi
fi

# Ensure ansible directories exist with proper permissions
mkdir -p /tmp/ansible-ssh
chmod -R 777 /tmp/ansible-ssh
echo "Ansible SSH directory created with permissions 777"

# Ensure log directory exists with proper permissions
mkdir -p /app/logs
touch /app/logs/application.log
chmod -R 777 /app/logs
echo "Logs directory created with permissions 777"

# Set ansible.cfg to use the correct control path
cat > /etc/ansible/ansible.cfg << EOF
[defaults]
host_key_checking = False
timeout = 30
inventory = /app/inventory/inventory.ini
remote_user = infadm
log_path = /app/logs/ansible.log
become = True
become_method = sudo
become_user = infadm
private_key_file = /root/.ssh/id_rsa
control_path_dir = /tmp/ansible-ssh
forks = 10

[privilege_escalation]
become = True
become_method = sudo
become_user = infadm

[ssh_connection]
pipelining = True
control_path = /tmp/ansible-ssh/%h-%p-%r
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
EOF

echo "Ansible configuration created at /etc/ansible/ansible.cfg"

# Run the specified command
exec "$@"
