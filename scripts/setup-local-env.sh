
#!/bin/bash
# Script to set up local environment for testing

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# Set variables
CONTAINER_NAME="fix-deployment-orchestrator"
SSH_KEY_DIR="/tmp/ssh-keys"

# Create SSH key directory
mkdir -p "$SSH_KEY_DIR"
chmod 700 "$SSH_KEY_DIR"

# Generate SSH keys if they don't exist
if [ ! -f "$SSH_KEY_DIR/id_rsa" ]; then
  echo "Generating SSH keys..."
  ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_DIR/id_rsa" -N ""
  echo "SSH keys generated"
else
  echo "SSH keys already exist"
fi

# Create SSH config file
cat > "$SSH_KEY_DIR/config" <<EOF
Host batch1 batch2 imdg1 imdg2
  User infadm
  IdentityFile ~/.ssh/id_rsa
  StrictHostKeyChecking no
EOF

# Set proper permissions
chmod 600 "$SSH_KEY_DIR/id_rsa"
chmod 644 "$SSH_KEY_DIR/id_rsa.pub"
chmod 644 "$SSH_KEY_DIR/config"

# Create ansible.cfg
mkdir -p "/etc/ansible"
cat > "/etc/ansible/ansible.cfg" <<EOF
[defaults]
host_key_checking = False
timeout = 30
inventory = /app/inventory/inventory.ini
remote_user = infadm
log_path = /app/logs/ansible.log
become = True
become_method = sudo
become_user = infadm

[privilege_escalation]
become = True
become_method = sudo
become_user = infadm

[ssh_connection]
pipelining = True
control_path = /tmp/ansible-ssh-%%h-%%p-%%r
EOF

# Create logs directory
mkdir -p /app/logs
chmod 755 /app/logs

echo "Local environment setup complete."
echo "To use this with Docker:"
echo "docker run -d -p 5000:5000 \\"
echo "  -v $SSH_KEY_DIR:/root/.ssh \\"
echo "  -v /etc/ansible:/etc/ansible \\"
echo "  -v /app/logs:/app/logs \\"
echo "  --name $CONTAINER_NAME \\"
echo "  $CONTAINER_NAME:latest"

echo ""
echo "Make sure to copy your SSH public key to the target hosts:"
echo "For local testing on the same machine (batch1):"
echo "mkdir -p ~/.ssh"
echo "cat $SSH_KEY_DIR/id_rsa.pub >> ~/.ssh/authorized_keys"
echo "chmod 600 ~/.ssh/authorized_keys"
