from flask import Flask, render_template, request, send_file, jsonify, session, redirect, url_for
import os
import time
from datetime import datetime, timedelta
import threading
import subprocess
import logging
from functools import wraps
import secrets

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
WORKING_DIR = "/opt/tables"
SKLAD_FILE = os.path.join(WORKING_DIR, "sklad.xlsx")
REESTR_FILE = os.path.join(WORKING_DIR, "reestr.xlsx")
RESULT_FILE = os.path.join(WORKING_DIR, "exit.xlsx")

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Login credentials
VALID_USERNAME = "User"
VALID_PASSWORD = "P@s7w0rd"

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def cleanup_old_files():
    while True:
        current_time = datetime.now()
        for filename in ['sklad.xlsx', 'reestr.xlsx', 'exit.xlsx']:
            filepath = os.path.join(WORKING_DIR, filename)
            if os.path.exists(filepath):
                file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
                if current_time - file_time > timedelta(hours=1):
                    try:
                        os.remove(filepath)
                        logger.info(f"Removed old file: {filename}")
                    except Exception as e:
                        logger.error(f"Error removing file {filename}: {str(e)}")
        time.sleep(300)  # Check every 5 minutes

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'xlsx'}

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if username == VALID_USERNAME and password == VALID_PASSWORD:
            session['user'] = username
            session.permanent = True
            return jsonify({'status': 'success'})
        return jsonify({'status': 'error', 'message': 'Неверный логин или пароль'})
    
    return render_template('login.html')

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({'status': 'success'})

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'})
    
    if not allowed_file(file.filename):
        return jsonify({'status': 'error', 'message': 'Invalid file type'})
    
    file_type = request.form.get('type')
    target_filename = f"{file_type}.xlsx"
    target_path = os.path.join(WORKING_DIR, target_filename)
    
    if os.path.exists(target_path):
        return jsonify({'status': 'error', 'message': f'File {target_filename} already exists'})
    
    try:
        file.save(target_path)
        logger.info(f"File {target_filename} uploaded successfully")
        return jsonify({'status': 'success', 'message': f'File {target_filename} uploaded successfully'})
    except Exception as e:
        logger.error(f"Error saving file {target_filename}: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Error saving file'})

@app.route('/start', methods=['POST'])
@login_required
def start_process():
    if not os.path.exists(SKLAD_FILE):
        return jsonify({'status': 'error', 'message': 'No sklad.xlsx file'})
    if not os.path.exists(REESTR_FILE):
        return jsonify({'status': 'error', 'message': 'No reestr.xlsx file'})
    
    try:
        process = subprocess.Popen(['python3', os.path.join(WORKING_DIR, 'transform_data.py')])
        logger.info(f"Started process with PID: {process.pid}")
        return jsonify({'status': 'success', 'message': 'Processing started'})
    except Exception as e:
        logger.error(f"Error starting process: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/download')
@login_required
def download_file():
    if os.path.exists(RESULT_FILE):
        return send_file(RESULT_FILE, as_attachment=True)
    return jsonify({'status': 'error', 'message': 'File not found'})

@app.route('/clear', methods=['POST'])
@login_required
def clear_files():
    files = ['sklad.xlsx', 'reestr.xlsx', 'exit.xlsx']
    cleared = []
    for file in files:
        file_path = os.path.join(WORKING_DIR, file)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                cleared.append(file)
                logger.info(f"Removed file: {file}")
            except Exception as e:
                logger.error(f"Error removing {file}: {str(e)}")
    return jsonify({
        'status': 'success', 
        'message': f'Files cleared: {", ".join(cleared)}' if cleared else 'No files to clear'
    })

@app.route('/check_files')
@login_required
def check_files():
    exit_exists = os.path.exists(RESULT_FILE)
    return jsonify({'exit_exists': exit_exists})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)