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
WORKING_DIR = os.path.dirname(os.path.abspath(__file__))  # Текущая директория скрипта
SKLAD_FILE = os.path.join(WORKING_DIR, "sklad.xlsx")
REESTR_FILE = os.path.join(WORKING_DIR, "reestr.xlsx")
RESULT_FILE = os.path.join(WORKING_DIR, "exit.xlsx")

app = Flask(__name__)
# Фиксированный ключ для стабильности сессий
app.secret_key = 'excel_processor_secret_key_2024_stable'

# Минимальные настройки сессий - только самое необходимое
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = False  # Упрощаем для отладки
app.config['SESSION_COOKIE_SAMESITE'] = None
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=1)  # 24 часа
app.config['SESSION_REFRESH_EACH_REQUEST'] = False  # Не трогаем сессию без необходимости

# Login credentials
VALID_USERNAME = "User"
VALID_PASSWORD = "P@s7w0rd"

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Простая проверка - есть ли пользователь в сессии
        if 'user' not in session or not session['user']:
            logger.info(f"No valid session for {request.endpoint}")
            
            # Для AJAX запросов (определяем по заголовку)
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'status': 'error', 'message': 'Требуется авторизация'}), 401
            
            # Для обычных запросов - редирект
            return redirect(url_for('login'))
        
        # Пользователь авторизован - продолжаем
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
        if not data:
            return jsonify({'status': 'error', 'message': 'Некорректные данные'})
        
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        logger.info(f"Login attempt for user: {username}")
        
        # Простая проверка логина и пароля
        if username == VALID_USERNAME and password == VALID_PASSWORD:
            # Устанавливаем сессию
            session.clear()  # Очищаем старую сессию
            session['user'] = username
            session['login_time'] = datetime.now().isoformat()
            session.permanent = True
            
            logger.info(f"Successful login for user: {username}")
            return jsonify({'status': 'success'})
        else:
            logger.warning(f"Failed login attempt for user: {username}")
            return jsonify({'status': 'error', 'message': 'Неверный логин или пароль'})
    
    # GET запрос - показываем форму входа
    return render_template('login.html')

@app.route('/logout', methods=['POST'])
def logout():
    logger.info(f"Logout for user: {session.get('user', 'unknown')}")
    session.clear()  # Полностью очищаем сессию
    return jsonify({'status': 'success'})

@app.route('/check_auth')
def check_auth():
    """Простая проверка статуса авторизации"""
    user = session.get('user')
    if user:
        return jsonify({
            'authenticated': True, 
            'user': user,
            'login_time': session.get('login_time', 'unknown')
        })
    else:
        return jsonify({'authenticated': False})

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
        response = jsonify({'status': 'error', 'message': 'Файл sklad.xlsx не найден'})
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    if not os.path.exists(REESTR_FILE):
        response = jsonify({'status': 'error', 'message': 'Файл reestr.xlsx не найден'})
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    
    try:
        # Определяем команду Python в зависимости от ОС
        import sys
        python_cmd = sys.executable  # Использует тот же Python, что и Flask app
        script_path = os.path.join(WORKING_DIR, 'transform_data.py')
        
        logger.info(f"Starting process: {python_cmd} {script_path}")
        process = subprocess.Popen([python_cmd, script_path], 
                                 stdout=subprocess.PIPE, 
                                 stderr=subprocess.PIPE)
        logger.info(f"Started process with PID: {process.pid}")
        
        response = jsonify({'status': 'success', 'message': 'Processing started'})
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    except Exception as e:
        logger.error(f"Error starting process: {str(e)}")
        response = jsonify({'status': 'error', 'message': f'Ошибка запуска процесса: {str(e)}'})
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response

@app.route('/download')
@login_required
def download_file():
    try:
        logger.info(f"Download request received. Checking file: {RESULT_FILE}")
        
        if os.path.exists(RESULT_FILE):
            # Проверяем размер файла
            file_size = os.path.getsize(RESULT_FILE)
            logger.info(f"File exists, size: {file_size} bytes")
            
            # Добавим заголовки для предотвращения кэширования
            response = send_file(
                RESULT_FILE,
                as_attachment=True,
                download_name='result.xlsx',
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            
            logger.info("File sent successfully")
            return response
        else:
            logger.warning(f"File not found: {RESULT_FILE}")
            # Проверим, какие файлы есть в директории
            try:
                files_in_dir = os.listdir(WORKING_DIR)
                logger.info(f"Files in working directory: {files_in_dir}")
            except Exception as dir_error:
                logger.error(f"Error listing directory: {dir_error}")
                
            return jsonify({'status': 'error', 'message': 'File not found'})
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/clear', methods=['POST'])
@login_required
def clear_files():
    try:
        logger.info("Clear files request received")
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
        
        result = {
            'status': 'success', 
            'message': f'Files cleared: {", ".join(cleared)}' if cleared else 'No files to clear'
        }
        logger.info(f"Clear files result: {result}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in clear_files endpoint: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Ошибка при очистке файлов: {str(e)}'})

@app.route('/check_files')
@login_required
def check_files():
    try:
        exit_exists = os.path.exists(RESULT_FILE)
        sklad_exists = os.path.exists(SKLAD_FILE)
        reestr_exists = os.path.exists(REESTR_FILE)
        
        # Дополнительная информация о файлах
        file_info = {}
        for file_name, file_path in [('exit', RESULT_FILE), ('sklad', SKLAD_FILE), ('reestr', REESTR_FILE)]:
            if os.path.exists(file_path):
                try:
                    stat = os.stat(file_path)
                    file_info[f'{file_name}_size'] = stat.st_size
                    file_info[f'{file_name}_mtime'] = datetime.fromtimestamp(stat.st_mtime).isoformat()
                except Exception as e:
                    logger.error(f"Error getting info for {file_name}: {e}")
        
        logger.info(f"File check: sklad={sklad_exists}, reestr={reestr_exists}, exit={exit_exists}")
        logger.debug(f"File info: {file_info}")
        
        result = {
            'exit_exists': exit_exists,
            'sklad_exists': sklad_exists,
            'reestr_exists': reestr_exists,
            'working_dir': WORKING_DIR,
            **file_info
        }
        
        # Устанавливаем правильный content-type
        response = jsonify(result)
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
    except Exception as e:
        logger.error(f"Error in check_files: {str(e)}")
        error_response = jsonify({
            'status': 'error', 
            'message': f'Ошибка проверки файлов: {str(e)}',
            'exit_exists': False,
            'sklad_exists': False,
            'reestr_exists': False
        })
        error_response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return error_response

@app.route('/get_logs')
@login_required
def get_logs():
    """Получить последние строки из лога для отладки"""
    try:
        log_file = os.path.join(WORKING_DIR, 'app.log')
        if os.path.exists(log_file):
            with open(log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                # Возвращаем последние 50 строк
                recent_lines = lines[-50:] if len(lines) > 50 else lines
                return jsonify({'logs': recent_lines})
        else:
            return jsonify({'logs': ['Файл логов не найден']})
    except Exception as e:
        logger.error(f"Error reading logs: {str(e)}")
        return jsonify({'logs': [f'Ошибка чтения логов: {str(e)}']})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
    