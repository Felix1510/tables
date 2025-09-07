/**
 * Веб-интерфейс для системы обработки Excel файлов
 * Полностью переработанная версия с улучшенной архитектурой
 */

// =============================================================================
// КОНФИГУРАЦИЯ И КОНСТАНТЫ
// =============================================================================

const CONFIG = {
    ENDPOINTS: {
        LOGIN: '/login',
        LOGOUT: '/logout',
        CHECK_AUTH: '/check_auth',
        UPLOAD: '/upload',
        START: '/start',
        DOWNLOAD: '/download',
        CLEAR: '/clear',
        CHECK_FILES: '/check_files',
        GET_LOGS: '/get_logs'
    },
    TIMEOUTS: {
        REQUEST: 30000,
        RETRY_DELAY: 1000,
        REDIRECT_DELAY: 2000
    },
    RETRY_ATTEMPTS: 3,
    UPDATE_INTERVAL: 10000
};

// =============================================================================
// УТИЛИТЫ И БАЗОВЫЕ ФУНКЦИИ
// =============================================================================

/**
 * Простая функция для HTTP запросов без сложной логики
 */
async function makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUTS.REQUEST);
    
    try {
        const defaultOptions = {
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        clearTimeout(timeoutId);
        
        // Проверяем статус ответа
        if (!response.ok) {
            if (response.status === 401) {
                handleAuthError();
                throw new Error('Требуется авторизация');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Определяем тип ответа
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            return await response.json();
        } else if (contentType.includes('application/vnd.openxmlformats') || 
                   contentType.includes('application/octet-stream')) {
            return response; // Возвращаем сырой ответ для файлов
        } else {
            const text = await response.text();
            throw new Error(`Неожиданный тип ответа: ${contentType}`);
        }
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('Превышено время ожидания запроса');
        }
        throw error;
    }
}

/**
 * Функция с повторными попытками
 */
async function makeRequestWithRetry(url, options = {}, maxRetries = CONFIG.RETRY_ATTEMPTS) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Запрос к ${url}, попытка ${attempt}/${maxRetries}`);
            return await makeRequest(url, options);
        } catch (error) {
            lastError = error;
            console.warn(`Попытка ${attempt} неудачна:`, error.message);
            
            if (attempt < maxRetries && (error.message.includes('Failed to fetch') || 
                                       error.message.includes('Превышено время'))) {
                showMessage(`Повторяем запрос... (${attempt}/${maxRetries})`, 'warning');
                await sleep(CONFIG.TIMEOUTS.RETRY_DELAY);
            } else {
                break;
            }
        }
    }
    
    throw lastError;
}

/**
 * Утилита для задержки
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Обработка ошибок авторизации
 */
function handleAuthError() {
    showMessage('Сессия истекла, требуется повторная авторизация', 'warning');
    setTimeout(() => {
        window.location.href = '/login';
    }, CONFIG.TIMEOUTS.REDIRECT_DELAY);
}

// =============================================================================
// СИСТЕМА СООБЩЕНИЙ
// =============================================================================

/**
 * Показать сообщение в консоли статуса
 */
function showMessage(message, type = 'info') {
    if (!message || message.trim() === '') {
        message = 'Получено пустое сообщение';
        type = 'error';
    }
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    const messageElement = document.createElement('div');
    messageElement.className = `status-message ${type}`;
    messageElement.innerHTML = `
        <span class="message-time">[${timeString}]</span>
        <span class="message-text">${message}</span>
    `;
    
    const statusDiv = document.getElementById('status-messages');
    if (statusDiv) {
        statusDiv.insertBefore(messageElement, statusDiv.firstChild);
        statusDiv.scrollTop = 0;
        console.log(`[${type.toUpperCase()}] ${timeString}: ${message}`);
    }
}

// =============================================================================
// ИНДИКАТОРЫ ФАЙЛОВ
// =============================================================================

/**
 * Обновить индикаторы состояния файлов
 */
async function updateFileIndicators() {
    try {
        console.log('Обновление индикаторов файлов...');
        const data = await makeRequest(CONFIG.ENDPOINTS.CHECK_FILES);
        
        console.log('Состояние файлов:', data);
        
        // Обновляем индикаторы
        setIndicator('sklad-indicator', data.sklad_exists === true);
        setIndicator('reestr-indicator', data.reestr_exists === true);
        setIndicator('result-indicator', data.exit_exists === true);
        
        // Обновляем кнопку скачивания
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = !(data.exit_exists === true);
        }
        
    } catch (error) {
        console.error('Ошибка обновления индикаторов:', error);
        // Не показываем ошибку пользователю для фоновых обновлений
    }
}

/**
 * Установить состояние индикатора
 */
function setIndicator(indicatorId, isActive) {
    const indicator = document.getElementById(indicatorId);
    if (indicator) {
        if (isActive) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
}

// =============================================================================
// АВТОРИЗАЦИЯ
// =============================================================================

/**
 * Проверка статуса авторизации для главной страницы
 */
async function checkAuthStatus() {
    try {
        const data = await makeRequest(CONFIG.ENDPOINTS.CHECK_AUTH);
        if (!data.authenticated) {
            window.location.href = '/login';
        } else {
            console.log('Пользователь авторизован:', data.user);
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        window.location.href = '/login';
    }
}

/**
 * Проверка авторизации для страницы входа
 */
async function checkAuthStatusForLogin() {
    try {
        const data = await makeRequest(CONFIG.ENDPOINTS.CHECK_AUTH);
        if (data.authenticated) {
            console.log('Пользователь уже авторизован');
            window.location.href = '/';
        }
    } catch (error) {
        console.log('Пользователь не авторизован');
    }
}

/**
 * Выход из системы
 */
async function logout() {
    try {
        showMessage('Выполняется выход из системы...', 'info');
        
        // Сначала очищаем файлы
        try {
            await makeRequest(CONFIG.ENDPOINTS.CLEAR, { method: 'POST' });
        } catch (clearError) {
            console.warn('Не удалось очистить файлы при выходе:', clearError);
        }
        
        // Затем выходим
        await makeRequest(CONFIG.ENDPOINTS.LOGOUT, { method: 'POST' });
        showMessage('Выход выполнен успешно', 'success');
        
        setTimeout(() => {
            window.location.href = '/login';
        }, 1000);
        
    } catch (error) {
        console.error('Ошибка при выходе:', error);
        showMessage('Ошибка при выходе', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
    }
}

// =============================================================================
// ЗАГРУЗКА ФАЙЛОВ
// =============================================================================

/**
 * Загрузить файл на сервер
 */
async function uploadFile(type) {
    const fileInput = document.getElementById(`${type}-file`);
    const file = fileInput.files[0];
    
    if (!file) {
        showMessage('Пожалуйста, выберите файл', 'warning');
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showMessage('Поддерживаются только файлы .xlsx', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    
    try {
        showMessage(`Загружаем ${file.name}...`, 'info');
        
        const data = await makeRequestWithRetry(CONFIG.ENDPOINTS.UPLOAD, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (data.status === 'success') {
            showMessage(data.message, 'success');
            fileInput.value = ''; // Очищаем input
            await updateFileIndicators(); // Обновляем индикаторы
        } else {
            showMessage(data.message || 'Ошибка загрузки файла', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        showMessage(`Ошибка загрузки файла: ${error.message}`, 'error');
    }
}

// =============================================================================
// ОБРАБОТКА ДАННЫХ
// =============================================================================

/**
 * Запустить процесс обработки
 */
async function startProcess() {
    try {
        showMessage('Запускаем процесс обработки...', 'info');
        
        const data = await makeRequest(CONFIG.ENDPOINTS.START, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (data.status === 'success') {
            showMessage(data.message, 'success');
            startFileCheck(); // Начинаем проверку результата
        } else {
            showMessage(data.message || 'Ошибка запуска процесса', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка запуска процесса:', error);
        showMessage(`Ошибка запуска процесса: ${error.message}`, 'error');
    }
}

/**
 * Проверка готовности результата
 */
function startFileCheck() {
    let attempts = 0;
    const maxAttempts = 60; // 2 минуты максимум
    
    const checkInterval = setInterval(async () => {
        attempts++;
        
        try {
            const data = await makeRequest(CONFIG.ENDPOINTS.CHECK_FILES);
            
            if (data.exit_exists) {
                showMessage('Обработка завершена! Файл готов для скачивания', 'success');
                await updateFileIndicators();
                clearInterval(checkInterval);
                return;
            }
            
            // Показываем прогресс каждые 10 попыток
            if (attempts % 10 === 0) {
                showMessage(`Обработка продолжается... (${attempts * 2} сек)`, 'info');
            }
            
            if (attempts >= maxAttempts) {
                showMessage('Превышено время ожидания результата. Проверьте логи.', 'error');
                clearInterval(checkInterval);
            }
            
        } catch (error) {
            console.error('Ошибка проверки файлов:', error);
            if (attempts >= 5) { // Прекращаем после 5 неудачных попыток
                showMessage('Ошибка при проверке статуса обработки', 'error');
                clearInterval(checkInterval);
            }
        }
    }, 2000);
}

// =============================================================================
// СКАЧИВАНИЕ ФАЙЛОВ
// =============================================================================

/**
 * Скачать результирующий файл
 */
async function downloadFile() {
    try {
        showMessage('Подготовка файла к скачиванию...', 'info');
        
        // Проверяем наличие файла
        const checkData = await makeRequest(CONFIG.ENDPOINTS.CHECK_FILES);
        if (!checkData.exit_exists) {
            showMessage('Файл результата не найден', 'error');
            await updateFileIndicators();
            return;
        }
        
        showMessage('Скачиваем файл...', 'info');
        
        // Скачиваем файл
        const response = await makeRequest(CONFIG.ENDPOINTS.DOWNLOAD);
        
        // response здесь - это Response объект для файла
        const blob = await response.blob();
        
        if (blob.size === 0) {
            showMessage('Получен пустой файл', 'error');
            return;
        }
        
        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'result.xlsx';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Освобождаем память
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 100);
        
        showMessage('Файл успешно скачан', 'success');
        
    } catch (error) {
        console.error('Ошибка скачивания:', error);
        showMessage(`Ошибка скачивания: ${error.message}`, 'error');
    }
}

// =============================================================================
// УПРАВЛЕНИЕ ФАЙЛАМИ
// =============================================================================

/**
 * Очистить все файлы на сервере
 */
async function clearFiles() {
    try {
        showMessage('Очищаем файлы на сервере...', 'info');
        
        const data = await makeRequestWithRetry(CONFIG.ENDPOINTS.CLEAR, {
            method: 'POST'
        });
        
        if (data.status === 'success') {
            showMessage(data.message, 'success');
        } else {
            showMessage(data.message || 'Ошибка очистки файлов', 'error');
        }
        
        await updateFileIndicators();
        
    } catch (error) {
        console.error('Ошибка очистки файлов:', error);
        showMessage(`Ошибка очистки файлов: ${error.message}`, 'error');
    }
}

// =============================================================================
// ЛОГИ
// =============================================================================

/**
 * Показать логи системы
 */
async function showLogs() {
    try {
        const data = await makeRequest(CONFIG.ENDPOINTS.GET_LOGS);
        
        if (data && data.logs) {
            showMessage('=== ЛОГИ СИСТЕМЫ ===', 'info');
            data.logs.forEach(line => {
                if (line.trim()) {
                    const logType = line.includes('ERROR') ? 'error' : 
                                   line.includes('WARNING') ? 'warning' : 'info';
                    showMessage(line.trim(), logType);
                }
            });
            showMessage('=== КОНЕЦ ЛОГОВ ===', 'info');
        } else {
            showMessage('Логи не найдены', 'warning');
        }
        
    } catch (error) {
        console.error('Ошибка получения логов:', error);
        showMessage(`Ошибка получения логов: ${error.message}`, 'error');
    }
}

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

/**
 * Обработка формы входа
 */
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('login-error');
        
        if (!username || !password) {
            errorElement.textContent = 'Введите логин и пароль';
            return;
        }
        
        try {
            console.log('Попытка входа для пользователя:', username);
            
            const data = await makeRequest(CONFIG.ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            console.log('Ответ сервера:', data);
            
            if (data.status === 'success') {
                console.log('Успешный вход');
                errorElement.textContent = '';
                window.location.href = '/';
            } else {
                console.log('Неудачный вход:', data.message);
                errorElement.textContent = data.message || 'Ошибка входа';
            }
            
        } catch (error) {
            console.error('Ошибка входа:', error);
            errorElement.textContent = `Ошибка входа: ${error.message}`;
        }
    });
}

/**
 * Инициализация приложения
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Инициализация веб-интерфейса...');
    
    const currentPath = window.location.pathname;
    
    if (currentPath === '/login') {
        // Страница входа
        console.log('Инициализация страницы входа');
        checkAuthStatusForLogin();
        initLoginForm();
        
    } else if (currentPath === '/' || currentPath === '') {
        // Главная страница
        console.log('Инициализация главной страницы');
        checkAuthStatus();
        
        // Показываем приветствие
        showMessage('Система готова к работе', 'info');
        
        // Обновляем индикаторы
        updateFileIndicators();
        
        // Запускаем периодическое обновление индикаторов
        setInterval(updateFileIndicators, CONFIG.UPDATE_INTERVAL);
    }
});

// =============================================================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ (для доступа из HTML)
// =============================================================================

// Экспортируем функции в глобальную область видимости
window.uploadFile = uploadFile;
window.startProcess = startProcess;
window.downloadFile = downloadFile;
window.clearFiles = clearFiles;
window.showLogs = showLogs;
window.logout = logout;