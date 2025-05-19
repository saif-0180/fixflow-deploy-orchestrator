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

# Display SSH key fingerprints for debugging
if [ -f "/root/.ssh/id_rsa" ]; then
  echo "SSH key fingerprints:"
  ssh-keygen -l -f /root/.ssh/id_rsa
fi

# Run the specified command
exec "$@"
