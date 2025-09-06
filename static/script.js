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
        // Обновляем индикаторы файлов при загрузке страницы
        updateFileIndicators();
        
        // Периодически обновляем индикаторы каждые 10 секунд
        setInterval(() => {
            updateFileIndicators();
        }, 10000);
    }
});

// Общая функция для обработки запросов
async function handleRequest(url, options = {}, retries = 2) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут
    
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'same-origin', // Важно для работы с сессиями
            signal: controller.signal
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Если сессия истекла, показываем сообщение и перенаправляем на страницу входа
                console.log('Сессия истекла, требуется повторная авторизация');
                addStatusMessage('Сессия истекла, требуется повторная авторизация', 'warning');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                return { status: 'error', message: 'Сессия истекла' };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Проверяем тип контента
        const contentType = response.headers.get('content-type') || '';
        console.log(`Response content-type: ${contentType}, URL: ${url}`);
        
        if (contentType.includes('application/json')) {
            try {
                const jsonData = await response.json();
                // Проверяем, что JSON содержит ожидаемые поля
                if (jsonData && typeof jsonData === 'object') {
                    return jsonData;
                } else {
                    console.error('Invalid JSON response:', jsonData);
                    return { status: 'error', message: 'Получен некорректный ответ от сервера' };
                }
            } catch (jsonError) {
                console.error('JSON parse error:', jsonError);
                return { status: 'error', message: 'Ошибка парсинга JSON ответа' };
            }
        } else if (contentType.includes('text/html')) {
            // HTML ответ - возможно редирект на страницу логина
            const htmlText = await response.text();
            console.warn('Received HTML response, possible redirect to login:', htmlText.substring(0, 200));
            
            if (htmlText.includes('login') || htmlText.includes('авторизация')) {
                addStatusMessage('Сессия истекла, требуется повторная авторизация', 'warning');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                return { status: 'error', message: 'Сессия истекла' };
            } else {
                return { 
                    status: 'error', 
                    message: `Сервер вернул HTML вместо JSON: ${response.status}` 
                };
            }
        } else if (contentType.includes('application/vnd.openxmlformats') || 
                   contentType.includes('application/octet-stream') ||
                   contentType.includes('application/excel')) {
            // Это файл - возвращаем сам response для обработки как файл
            console.log('File response detected, returning response object');
            return response;
        } else {
            // Неожиданный тип контента
            try {
                const textResponse = await response.text();
                console.error('Unexpected content-type:', contentType, 'Response:', textResponse.substring(0, 200));
                
                // Пытаемся распарсить как JSON на случай, если content-type неправильный
                try {
                    const jsonData = JSON.parse(textResponse);
                    console.log('Successfully parsed as JSON despite wrong content-type');
                    return jsonData;
                } catch (parseError) {
                    return { 
                        status: 'error', 
                        message: `Неизвестный тип ответа: ${contentType || 'не указан'}` 
                    };
                }
            } catch (textError) {
                return { 
                    status: 'error', 
                    message: `Ошибка чтения ответа сервера: ${textError.message}` 
                };
            }
        }
    } catch (error) {
        clearTimeout(timeoutId);
        
        // Если это таймаут или сетевая ошибка, пробуем повторить
        if ((error.name === 'AbortError' || error.name === 'TypeError') && retries > 0) {
            console.log(`Запрос ${url} неудачен, повторяем... (осталось попыток: ${retries})`);
            addStatusMessage(`Повторяем запрос... (осталось попыток: ${retries})`, 'warning');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза 1 секунда
            return handleRequest(url, options, retries - 1);
        }
        
        console.error('Request failed:', error);
        
        // Возвращаем структурированную ошибку вместо выброса исключения
        if (error.name === 'AbortError') {
            return { status: 'error', message: 'Запрос превысил время ожидания (30 сек)' };
        } else {
            return { status: 'error', message: `Ошибка сети: ${error.message}` };
        }
    } finally {
        clearTimeout(timeoutId);
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
                // Очищаем файлы при входе в систему для чистого старта
                try {
                    await handleRequest('/clear', { method: 'POST' });
                } catch (clearError) {
                    console.log('Warning: Could not clear files on login:', clearError);
                }
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
        // Сначала очищаем файлы
        addStatusMessage('Очистка файлов перед выходом...', 'info');
        await handleRequest('/clear', { method: 'POST' });
        
        // Затем выходим из системы
        await handleRequest('/logout', { method: 'POST' });
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
            // Обновляем индикаторы после загрузки файла
            if (data.status === 'success') {
                updateFileIndicators();
            }
        } else if (data && data.status === 'error') {
            addStatusMessage(data.message || 'Ошибка при загрузке файла', 'error');
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
        } else if (data && data.status === 'error') {
            addStatusMessage(data.message || 'Ошибка при запуске процесса', 'error');
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
        addStatusMessage('Проверяем наличие файла...', 'info');
        
        // Сначала проверяем, что файл существует с повторными попытками
        let fileExists = false;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!fileExists && attempts < maxAttempts) {
            attempts++;
            console.log(`Checking file existence, attempt ${attempts}/${maxAttempts}`);
            
            const checkData = await handleRequest('/check_files');
            console.log('File check result:', checkData);
            
            if (checkData && checkData.exit_exists === true) {
                fileExists = true;
                console.log('File confirmed to exist');
                break;
            } else if (checkData && checkData.status === 'error') {
                addStatusMessage(`Ошибка проверки файла: ${checkData.message}`, 'error');
                return;
            } else {
                console.log(`File not found on attempt ${attempts}, waiting...`);
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        if (!fileExists) {
            addStatusMessage('Файл не найден на сервере', 'error');
            // Обновляем индикаторы
            updateFileIndicators();
            return;
        }
        
        addStatusMessage('Начинаем скачивание файла...', 'info');
        
        // Используем прямой fetch для скачивания файла с повторными попытками
        let downloadSuccess = false;
        let downloadAttempts = 0;
        const maxDownloadAttempts = 3;
        
        while (!downloadSuccess && downloadAttempts < maxDownloadAttempts) {
            downloadAttempts++;
            console.log(`Download attempt ${downloadAttempts}/${maxDownloadAttempts}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            try {
                const response = await fetch('/download', {
                    credentials: 'same-origin',
                    signal: controller.signal,
                    cache: 'no-cache', // Отключаем кэширование
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Ошибка при скачивании файла');
                    } else {
                        throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
                    }
                }
                
                // Создаем blob и скачиваем файл
                const blob = await response.blob();
                if (blob.size === 0) {
                    throw new Error('Получен пустой файл');
                }
                
                console.log(`Downloaded blob size: ${blob.size} bytes`);
                
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.style.display = 'none';
                link.href = url;
                link.download = 'result.xlsx';
                document.body.appendChild(link);
                link.click();
                
                // Очищаем ресурсы
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(link);
                }, 100);
                
                addStatusMessage('Файл успешно скачан', 'success');
                downloadSuccess = true;
                
            } catch (error) {
                clearTimeout(timeoutId);
                console.error(`Download attempt ${downloadAttempts} failed:`, error);
                
                if (downloadAttempts >= maxDownloadAttempts) {
                    if (error.name === 'AbortError') {
                        addStatusMessage('Скачивание прервано по таймауту', 'error');
                    } else {
                        addStatusMessage('Ошибка при скачивании файла: ' + error.message, 'error');
                    }
                } else {
                    addStatusMessage(`Повторяем скачивание... (попытка ${downloadAttempts + 1}/${maxDownloadAttempts})`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
    } catch (error) {
        console.error('Download function error:', error);
        addStatusMessage('Ошибка при скачивании: ' + error.message, 'error');
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
            // Обновляем индикаторы после очистки файлов
            updateFileIndicators();
        } else if (data && data.status === 'error') {
            addStatusMessage(data.message || 'Ошибка при очистке файлов', 'error');
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
                // Обновляем индикаторы после завершения обработки
                updateFileIndicators();
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

// File indicators functionality
async function updateFileIndicators() {
    try {
        console.log('Updating file indicators...');
        const data = await handleRequest('/check_files');
        
        console.log('File check response:', data);
        
        // Проверяем, что получили корректный ответ
        if (data && typeof data === 'object' && !data.status) {
            // Обновляем индикаторы
            updateIndicator('sklad-indicator', data.sklad_exists === true);
            updateIndicator('reestr-indicator', data.reestr_exists === true);
            updateIndicator('result-indicator', data.exit_exists === true);
            
            // Обновляем состояние кнопки скачивания
            const downloadBtn = document.getElementById('download-btn');
            if (downloadBtn) {
                downloadBtn.disabled = !(data.exit_exists === true);
            }
            
            console.log(`Indicators updated: sklad=${data.sklad_exists}, reestr=${data.reestr_exists}, result=${data.exit_exists}`);
        } else if (data && data.status === 'error') {
            console.warn('Error in check_files response:', data.message);
            // При ошибке оставляем индикаторы в текущем состоянии
        } else {
            console.warn('Unexpected response from check_files:', data);
        }
        
    } catch (error) {
        console.error('Error updating file indicators:', error);
        // При ошибке не показываем сообщение пользователю, чтобы не спамить
    }
}

function updateIndicator(indicatorId, isActive) {
    const indicator = document.getElementById(indicatorId);
    if (indicator) {
        if (isActive) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
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