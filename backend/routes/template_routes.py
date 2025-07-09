
from flask import Blueprint, request, jsonify, g
import json
import os
from datetime import datetime
from .auth_routes import get_current_user

template_bp = Blueprint('template', __name__)

TEMPLATES_DIR = '/app/deployment_templates'

# Ensure templates directory exists
os.makedirs(TEMPLATES_DIR, exist_ok=True)

def require_auth():
    """Check if user is authenticated"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    return None

@template_bp.route('/api/templates/save', methods=['POST'])
def save_template():
    """Save a deployment template"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    try:
        data = request.get_json()
        template = data.get('template')
        name = data.get('name')
        
        if not template or not name:
            return jsonify({'error': 'Template and name are required'}), 400
        
        # Add metadata if not present
        if 'metadata' not in template:
            template['metadata'] = {}
        
        template['metadata']['saved_at'] = datetime.now().isoformat()
        template['metadata']['saved_by'] = get_current_user()['username']
        
        # Save to file
        filename = f"{name}.json"
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        with open(filepath, 'w') as f:
            json.dump(template, f, indent=2)
        
        return jsonify({'message': 'Template saved successfully', 'filename': filename})
        
    except Exception as e:
        print(f"Error saving template: {str(e)}")
        return jsonify({'error': f'Failed to save template: {str(e)}'}), 500

@template_bp.route('/api/templates/list', methods=['GET'])
def list_templates():
    """List all saved templates"""
    try:
        templates = []
        if os.path.exists(TEMPLATES_DIR):
            for filename in os.listdir(TEMPLATES_DIR):
                if filename.endswith('.json'):
                    templates.append(filename.replace('.json', ''))
        
        return jsonify(templates)
        
    except Exception as e:
        print(f"Error listing templates: {str(e)}")
        return jsonify({'error': f'Failed to list templates: {str(e)}'}), 500

@template_bp.route('/api/templates/<template_name>', methods=['GET'])
def get_template(template_name):
    """Get a specific template"""
    try:
        filename = f"{template_name}.json"
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Template not found'}), 404
        
        with open(filepath, 'r') as f:
            template = json.load(f)
        
        return jsonify(template)
        
    except Exception as e:
        print(f"Error loading template: {str(e)}")
        return jsonify({'error': f'Failed to load template: {str(e)}'}), 500

@template_bp.route('/api/templates/<template_name>', methods=['DELETE'])
def delete_template(template_name):
    """Delete a template"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    try:
        filename = f"{template_name}.json"
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Template not found'}), 404
        
        os.remove(filepath)
        return jsonify({'message': 'Template deleted successfully'})
        
    except Exception as e:
        print(f"Error deleting template: {str(e)}")
        return jsonify({'error': f'Failed to delete template: {str(e)}'}), 500
