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
                // Если сессия истекла, перенаправляем на страницу входа
                window.location.href = '/login';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Проверяем тип контента
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return response;
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
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

// Logout functionality
async function logout() {
    try {
        await handleRequest('/logout', {
            method: 'POST'
        });
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
        addStatusMessage('Ошибка при выходе', 'error');
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
        addStatusMessage(data.message, data.status);
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
        addStatusMessage(data.message, data.status);
        
        if (data.status === 'success') {
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
        addStatusMessage(data.message, data.status);
        document.getElementById('download-btn').disabled = true;
    } catch (error) {
        addStatusMessage('Ошибка при очистке файлов', 'error');
    }
}

// Check for result file
async function checkExitFile() {
    let attempts = 0;
    const maxAttempts = 30; // 1 минута максимум
    
    const checkInterval = setInterval(async () => {
        try {
            const data = await handleRequest('/check_files');
            
            if (data.exit_exists) {
                document.getElementById('download-btn').disabled = false;
                addStatusMessage('Преобразование закончено, таблица доступна для скачивания', 'success');
                clearInterval(checkInterval);
            }
            
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                addStatusMessage('Превышено время ожидания результата', 'error');
            }
        } catch (error) {
            console.error('Error checking files:', error);
            clearInterval(checkInterval);
            addStatusMessage('Ошибка при проверке файлов', 'error');
        }
    }, 2000);
}

// Status message functionality
function addStatusMessage(message, type = 'info') {
    const statusDiv = document.getElementById('status-messages');
    if (statusDiv) {
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${type}`;
        messageElement.textContent = message;
        statusDiv.appendChild(messageElement);
        statusDiv.scrollTop = statusDiv.scrollHeight;
    }
}