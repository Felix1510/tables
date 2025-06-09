function addStatusMessage(message, type = 'info') {
    const statusDiv = document.getElementById('status-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `status-message ${type}`;
    messageElement.textContent = message;
    statusDiv.appendChild(messageElement);
    statusDiv.scrollTop = statusDiv.scrollHeight;
}

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

async function downloadFile() {
    window.location.href = '/download';
}

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