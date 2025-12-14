const { contextBridge, ipcRenderer } = require('electron');

// Обработчик ошибок из main процесса
ipcRenderer.on('error-occurred', (event, errorData) => {
    // Показываем ошибку пользователю, но не закрываем приложение
    console.error('Получена ошибка из main процесса:', errorData);

    // Создаем модальное окно с ошибкой
    const errorModal = document.createElement('div');
    errorModal.className = 'modal error-modal';
    errorModal.innerHTML = `
        <div class="modal-header">
            <h3><i class="fas fa-exclamation-triangle"></i> ${errorData.title}</h3>
            <button class="modal-close" onclick="this.closest('.modal').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="error-details">
                <p>${errorData.message}</p>
                ${errorData.stack ? `<details><summary>Технические детали</summary><pre>${errorData.stack}</pre></details>` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn btn-outline" onclick="this.closest('.modal').remove()">Закрыть</button>
                <button class="btn btn-primary" onclick="location.reload()">Перезагрузить приложение</button>
            </div>
        </div>
    `;

    document.body.appendChild(errorModal);

    // Показываем модальное окно
    setTimeout(() => {
        document.getElementById('modalOverlay').classList.add('active');
        errorModal.style.display = 'block';
    }, 100);

    // Добавляем уведомление в консоль браузера для разработчиков
    if (window.app && typeof window.app.showNotification === 'function') {
        window.app.showNotification(`${errorData.title}: ${errorData.message}`, 'error');
    }
});

// Безопасное API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
    // Проверка winget
    checkWinget: () => ipcRenderer.invoke('check-winget'),

    // Работа с пакетами
    getInstalledPackages: () => ipcRenderer.invoke('get-installed-packages'),
    checkPackageExists: (packageId) => ipcRenderer.invoke('check-package-exists', packageId),
    checkPackageInstalled: (packageId) => ipcRenderer.invoke('check-package-installed', packageId),
    installPackage: (packageId, packageName) => ipcRenderer.invoke('install-package', packageId, packageName),

    // DNS функции
    getActiveInterface: () => ipcRenderer.invoke('get-active-interface'),
    checkDns: () => ipcRenderer.invoke('check-dns'),
    setDns: () => ipcRenderer.invoke('set-dns'),
    rollbackDns: () => ipcRenderer.invoke('rollback-dns'),

    // Системные функции
    rebootSystem: () => ipcRenderer.invoke('reboot-system'),
    checkMultipleProgramsStatus: (programIds) => ipcRenderer.invoke('check-multiple-programs-status', programIds),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

    // Слушатели событий
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', callback),
    onInstallComplete: (callback) => ipcRenderer.on('install-complete', callback),

    // Удаление слушателей
    removeAllListeners: (event) => ipcRenderer.removeAllListeners(event)
});

// Дополнительные утилиты
contextBridge.exposeInMainWorld('utils', {
    // Проверка прав администратора (упрощенная версия)
    isAdmin: () => {
        try {
            // В Windows можно проверить через процесс
            return true; // Для простоты, в реальности нужно проверять
        } catch {
            return false;
        }
    },

    // Получение информации о системе
    getPlatform: () => process.platform,
    getVersion: () => process.version
});
