// Modal functionality
const modal = document.getElementById('description-modal');
const closeBtn = document.getElementsByClassName('close')[0];

function showDescription() {
    modal.style.display = 'block';
}

if (closeBtn) {
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    }
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
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
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
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
function logout() {
    fetch('/logout', {
        method: 'POST'
    }).then(() => {
        window.location.href = '/login';
    });
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
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        addStatusMessage(data.message, data.status);
    } catch (error) {
        addStatusMessage('Ошибка при загрузке файла', 'error');
    }
}

// Process start functionality
async function startProcess() {
    try {
        const response = await fetch('/start', {
            method: 'POST'
        });
        const data = await response.json();
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
    window.location.href = '/download';
}

// Clear files functionality
async function clearFiles() {
    try {
        const response = await fetch('/clear', {
            method: 'POST'
        });
        const data = await response.json();
        addStatusMessage(data.message, data.status);
        document.getElementById('download-btn').disabled = true;
    } catch (error) {
        addStatusMessage('Ошибка при очистке файлов', 'error');
    }
}

// Check for result file
async function checkExitFile() {
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch('/check_files');
            const data = await response.json();
            
            if (data.exit_exists) {
                document.getElementById('download-btn').disabled = false;
                addStatusMessage('Преобразование закончено, таблица доступна для скачивания', 'success');
                clearInterval(checkInterval);
            }
        } catch (error) {
            console.error('Error checking files:', error);
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