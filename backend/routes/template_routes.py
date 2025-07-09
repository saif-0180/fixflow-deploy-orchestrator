
from flask import Blueprint, request, jsonify, current_app
import json
import os
import logging
from datetime import datetime

template_bp = Blueprint('template', __name__)

# Get logger
logger = logging.getLogger('fix_deployment_orchestrator')

# Template storage directory
TEMPLATES_DIR = '/app/deployment_templates'

def ensure_templates_directory():
    """Ensure the templates directory exists"""
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    logger.info(f"Templates directory ensured: {TEMPLATES_DIR}")

@template_bp.route('/api/templates/save', methods=['POST'])
def save_template():
    """Save a deployment template"""
    try:
        ensure_templates_directory()
        
        data = request.get_json()
        template = data.get('template')
        name = data.get('name', 'template')
        
        if not template:
            return jsonify({'error': 'No template provided'}), 400
        
        # Ensure the name ends with .json
        if not name.endswith('.json'):
            name += '.json'
        
        # Save template to file
        template_path = os.path.join(TEMPLATES_DIR, name)
        
        with open(template_path, 'w') as f:
            json.dump(template, f, indent=2)
        
        logger.info(f"Template saved: {template_path}")
        
        return jsonify({
            'message': 'Template saved successfully',
            'path': template_path,
            'name': name
        })
        
    except Exception as e:
        logger.exception(f"Error saving template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@template_bp.route('/api/templates/list', methods=['GET'])
def list_templates():
    """List available deployment templates"""
    try:
        ensure_templates_directory()
        
        templates = []
        if os.path.exists(TEMPLATES_DIR):
            for file in os.listdir(TEMPLATES_DIR):
                if file.endswith('.json'):
                    templates.append(file.replace('.json', ''))
        
        logger.info(f"Listed {len(templates)} templates")
        return jsonify(templates)
        
    except Exception as e:
        logger.exception(f"Error listing templates: {str(e)}")
        return jsonify({'error': str(e)}), 500

@template_bp.route('/api/templates/<template_name>', methods=['GET'])
def get_template(template_name):
    """Get a specific template"""
    try:
        ensure_templates_directory()
        
        # Ensure the name ends with .json
        if not template_name.endswith('.json'):
            template_name += '.json'
        
        template_path = os.path.join(TEMPLATES_DIR, template_name)
        
        if not os.path.exists(template_path):
            return jsonify({'error': 'Template not found'}), 404
        
        with open(template_path, 'r') as f:
            template = json.load(f)
        
        logger.info(f"Template loaded: {template_path}")
        return jsonify(template)
        
    except Exception as e:
        logger.exception(f"Error loading template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@template_bp.route('/api/templates/<template_name>', methods=['DELETE'])
def delete_template(template_name):
    """Delete a template"""
    try:
        ensure_templates_directory()
        
        # Ensure the name ends with .json
        if not template_name.endswith('.json'):
            template_name += '.json'
        
        template_path = os.path.join(TEMPLATES_DIR, template_name)
        
        if not os.path.exists(template_path):
            return jsonify({'error': 'Template not found'}), 404
        
        os.remove(template_path)
        logger.info(f"Template deleted: {template_path}")
        
        return jsonify({'message': 'Template deleted successfully'})
        
    except Exception as e:
        logger.exception(f"Error deleting template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@template_bp.route('/api/fts', methods=['GET'])
def get_fts():
    """Get available FT numbers"""
    try:
        fix_files_dir = '/app/fixfiles/AllFts'
        fts = []
        
        if os.path.exists(fix_files_dir):
            for item in os.listdir(fix_files_dir):
                item_path = os.path.join(fix_files_dir, item)
                if os.path.isdir(item_path):
                    fts.append(item)
        
        fts.sort()
        logger.info(f"Found {len(fts)} FT numbers")
        return jsonify(fts)
        
    except Exception as e:
        logger.exception(f"Error getting FT numbers: {str(e)}")
        return jsonify({'error': str(e)}), 500

@template_bp.route('/api/files/<ft_number>', methods=['GET'])
def get_ft_files(ft_number):
    """Get files for a specific FT number"""
    try:
        ft_dir = os.path.join('/app/fixfiles/AllFts', ft_number)
        files = []
        
        if os.path.exists(ft_dir):
            for item in os.listdir(ft_dir):
                item_path = os.path.join(ft_dir, item)
                if os.path.isfile(item_path):
                    files.append(item)
        
        files.sort()
        logger.info(f"Found {len(files)} files for FT {ft_number}")
        return jsonify(files)
        
    except Exception as e:
        logger.exception(f"Error getting files for FT {ft_number}: {str(e)}")
        return jsonify({'error': str(e)}), 500
