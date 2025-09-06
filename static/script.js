// Modal functionality
function showDescription() {
    document.getElementById('description-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('description-modal').style.display = 'none';
}

// Close modal when clicking outside or on close button
window.onclick = function(event) {
    const modal = document.getElementById('description-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Handle close button click
document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            document.getElementById('description-modal').style.display = 'none';
        }
    }
    
    // Проверяем авторизацию при загрузке главной страницы
    if (window.location.pathname === '/' || window.location.pathname === '') {
        checkAuthStatus();
    }
    
    // Добавляем приветственное сообщение при загрузке страницы (только для главной страницы)
    if (window.location.pathname === '/' || window.location.pathname === '') {
        addStatusMessage('Система готова к работе', 'info');
    }
});

// Общая функция для обработки запросов
async function handleRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'same-origin' // Важно для работы с сессиями
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Если сессия истекла, показываем сообщение и перенаправляем на страницу входа
                console.log('Сессия истекла, требуется повторная авторизация');
                addStatusMessage('Сессия истекла, требуется повторная авторизация', 'warning');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Проверяем тип контента
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const jsonData = await response.json();
            // Проверяем, что JSON содержит ожидаемые поля
            if (jsonData && typeof jsonData === 'object') {
                return jsonData;
            } else {
                console.error('Invalid JSON response:', jsonData);
                return { status: 'error', message: 'Получен некорректный ответ от сервера' };
            }
        }
        return response;
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

// Check if already logged in on login page
if (window.location.pathname === '/login') {
    checkAuthStatusForLogin();
}

// Check authentication status for login page
async function checkAuthStatusForLogin() {
    try {
        const data = await handleRequest('/check_auth');
        if (data.authenticated) {
            // Если уже авторизован, перенаправляем на главную страницу
            console.log('Пользователь уже авторизован, перенаправление на главную');
            window.location.href = '/';
        }
    } catch (error) {
        console.log('Пользователь не авторизован, остаемся на странице входа');
    }
}

// Login form handling
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const data = await handleRequest('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (data.status === 'success') {
                window.location.href = '/';
            } else {
                document.getElementById('login-error').textContent = data.message;
            }
        } catch (error) {
            document.getElementById('login-error').textContent = 'Ошибка при входе';
        }
    });
}

// Check authentication status
async function checkAuthStatus() {
    try {
        const data = await handleRequest('/check_auth');
        if (!data.authenticated) {
            // Если не авторизован, перенаправляем на страницу входа
            window.location.href = '/login';
        } else {
            // Если авторизован, можно добавить приветствие с именем пользователя
            console.log('Пользователь авторизован:', data.user);
        }
    } catch (error) {
        console.error('Auth check error:', error);
        // В случае ошибки проверки, перенаправляем на страницу входа
        window.location.href = '/login';
    }
}

// Logout functionality
async function logout() {
    try {
        await handleRequest('/logout', {
            method: 'POST'
        });
        addStatusMessage('Выход выполнен успешно', 'info');
        // Небольшая задержка перед перенаправлением для показа сообщения
        setTimeout(() => {
            window.location.href = '/login';
        }, 1000);
    } catch (error) {
        console.error('Logout error:', error);
        addStatusMessage('Ошибка при выходе', 'error');
        // Даже при ошибке перенаправляем на страницу входа
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
    }
}

// File upload functionality
async function uploadFile(type) {
    const fileInput = document.getElementById(`${type}-file`);
    const file = fileInput.files[0];
    
    if (!file) {
        addStatusMessage('Пожалуйста, выберите файл', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
        const data = await handleRequest('/upload', {
            method: 'POST',
            body: formData
        });
        if (data && data.message) {
            addStatusMessage(data.message, data.status);
        } else {
            addStatusMessage('Получен пустой ответ от сервера при загрузке файла', 'error');
        }
    } catch (error) {
        addStatusMessage('Ошибка при загрузке файла', 'error');
    }
}

// Process start functionality
async function startProcess() {
    try {
        const data = await handleRequest('/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (data && data.message) {
            addStatusMessage(data.message, data.status);
        } else {
            addStatusMessage('Получен пустой ответ от сервера при запуске процесса', 'error');
        }
        
        if (data && data.status === 'success') {
            checkExitFile();
        }
    } catch (error) {
        addStatusMessage('Ошибка при запуске процесса', 'error');
    }
}

// File download functionality
async function downloadFile() {
    try {
        // Сначала проверим существование файла
        const checkData = await handleRequest('/check_files');
        
        if (!checkData.exit_exists) {
            addStatusMessage('Файл не найден', 'error');
            return;
        }

        // Создаем временную ссылку для скачивания
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);

        try {
            const response = await handleRequest('/download');
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            link.href = url;
            link.download = 'result.xlsx';
            link.click();
            
            // Очищаем URL после скачивания
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(link);
            }, 100);
        } catch (error) {
            console.error('Download error:', error);
            addStatusMessage('Ошибка при скачивании файла', 'error');
        }
    } catch (error) {
        console.error('Download error:', error);
        addStatusMessage('Ошибка при скачивании файла', 'error');
    }
}

// Clear files functionality
async function clearFiles() {
    try {
        const data = await handleRequest('/clear', {
            method: 'POST'
        });
        if (data && data.message) {
            addStatusMessage(data.message, data.status);
        } else {
            addStatusMessage('Получен пустой ответ от сервера при очистке файлов', 'error');
        }
        document.getElementById('download-btn').disabled = true;
    } catch (error) {
        addStatusMessage('Ошибка при очистке файлов', 'error');
    }
}

// Show logs functionality
async function showLogs() {
    try {
        const data = await handleRequest('/get_logs');
        if (data && data.logs) {
            addStatusMessage('=== ПОСЛЕДНИЕ ЗАПИСИ ЛОГОВ ===', 'info');
            data.logs.forEach(line => {
                if (line.trim()) {
                    const logType = line.includes('ERROR') ? 'error' : 
                                   line.includes('WARNING') ? 'warning' : 'info';
                    addStatusMessage(line.trim(), logType);
                }
            });
            addStatusMessage('=== КОНЕЦ ЛОГОВ ===', 'info');
        } else {
            addStatusMessage('Логи не найдены', 'warning');
        }
    } catch (error) {
        addStatusMessage('Ошибка при получении логов: ' + error.message, 'error');
    }
}

// Check for result file
async function checkExitFile() {
    let attempts = 0;
    const maxAttempts = 60; // 2 минуты максимум (увеличено время)
    
    const checkInterval = setInterval(async () => {
        try {
            const data = await handleRequest('/check_files');
            
            // Добавим отладочную информацию
            console.log(`Проверка файлов (попытка ${attempts + 1}/${maxAttempts}):`, data);
            
            if (data.exit_exists) {
                document.getElementById('download-btn').disabled = false;
                addStatusMessage('Преобразование закончено, таблица доступна для скачивания', 'success');
                clearInterval(checkInterval);
                return;
            }
            
            // Показываем прогресс каждые 10 попыток
            if (attempts % 10 === 0 && attempts > 0) {
                addStatusMessage(`Обработка файлов... (${attempts * 2} секунд)`, 'info');
            }
            
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                addStatusMessage(`Превышено время ожидания результата. Проверьте логи. Рабочая директория: ${data.working_dir || 'неизвестно'}`, 'error');
                
                // Показываем дополнительную диагностическую информацию
                if (data.sklad_exists === false || data.reestr_exists === false) {
                    addStatusMessage('Входные файлы не найдены! Проверьте загрузку файлов.', 'error');
                }
            }
        } catch (error) {
            console.error('Error checking files:', error);
            clearInterval(checkInterval);
            addStatusMessage('Ошибка при проверке файлов: ' + error.message, 'error');
        }
    }, 2000);
}

// Status message functionality
function addStatusMessage(message, type = 'info') {
    // Проверяем, что сообщение не пустое
    if (!message || message.trim() === '') {
        message = 'Получено пустое сообщение';
        type = 'error';
    }
    
    const statusDiv = document.getElementById('status-messages');
    if (statusDiv) {
        // Создаем элемент сообщения
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${type}`;
        
        // Получаем текущее время без даты
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Создаем содержимое с временной меткой
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = `[${timeString}] `;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'message-text';
        messageSpan.textContent = message;
        
        messageElement.appendChild(timeSpan);
        messageElement.appendChild(messageSpan);
        
        // Добавляем сообщение в начало списка
        if (statusDiv.firstChild) {
            statusDiv.insertBefore(messageElement, statusDiv.firstChild);
        } else {
            statusDiv.appendChild(messageElement);
        }
        
        // Скроллим к началу (к новому сообщению)
        statusDiv.scrollTop = 0;
        
        // Логируем сообщение в консоль для отладки
        console.log(`Status message [${type}] ${timeString}: ${message}`);
    }
}