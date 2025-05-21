
from flask import Blueprint, jsonify, request
import json
import os

db_routes = Blueprint('db_routes', __name__)

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
        return jsonify({"error": str(e)}), 500
