const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

// Путь к shared/packages.json (на два уровня выше electron/)
const SHARED_PACKAGES_PATH = path.join(__dirname, '..', 'shared', 'packages.json');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        frame: false, // Убираем стандартное меню Windows
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.svg'),
        backgroundColor: '#ffffff',
        show: false
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Открываем DevTools в режиме разработки
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized');
    });

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-unmaximized');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Глобальный обработчик необработанных ошибок
process.on('uncaughtException', (error) => {
    console.error('Необработанная ошибка:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('error-occurred', {
            title: 'Критическая ошибка',
            message: `Произошла необработанная ошибка: ${error.message}`,
            stack: error.stack
        });
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанное отклонение промиса:', reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('error-occurred', {
            title: 'Ошибка промиса',
            message: `Необработанное отклонение промиса: ${reason}`,
            stack: reason.stack || reason
        });
    }
});

// IPC обработчик для загрузки packages.json
ipcMain.handle('load-packages', async () => {
    try {
        if (fs.existsSync(SHARED_PACKAGES_PATH)) {
            const packages = JSON.parse(fs.readFileSync(SHARED_PACKAGES_PATH, 'utf-8'));
            return { success: true, packages };
        } else {
            // Fallback на GitHub
            return { success: false, message: 'packages.json not found' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// IPC обработчики для работы с winget
ipcMain.handle('check-winget', async () => {
    return new Promise((resolve) => {
        const winget = spawn('winget', ['--version'], {
            stdio: 'pipe',
            shell: true
        });

        winget.on('close', (code) => {
            resolve(code === 0);
        });

        winget.on('error', () => {
            resolve(false);
        });
    });
});

ipcMain.handle('get-installed-packages', async () => {
    // Возвращаем пустой массив, как в Python версии
    return [];
});

ipcMain.handle('check-package-exists', async (event, packageId) => {
    return new Promise((resolve) => {
        const winget = spawn('winget', ['show', '--id', packageId, '-e'], {
            stdio: 'pipe',
            shell: true
        });

        winget.on('close', (code) => {
            resolve(code === 0);
        });

        winget.on('error', () => {
            resolve(false);
        });
    });
});

ipcMain.handle('check-package-installed', async (event, packageId) => {
    return new Promise((resolve) => {
        const winget = spawn('winget', ['list', '--id', packageId, '-e'], {
            stdio: 'pipe',
            shell: true
        });

        winget.on('close', (code) => {
            resolve(code === 0);
        });

        winget.on('error', () => {
            resolve(false);
        });
    });
});

ipcMain.handle('install-package', async (event, packageId, packageName) => {
    return new Promise((resolve, reject) => {
        const installProcess = spawn('winget', [
            'install',
            '--id', packageId,
            '-e',
            '--silent',
            '--accept-source-agreements',
            '--accept-package-agreements'
        ], {
            stdio: 'pipe',
            shell: true
        });

        let output = '';
        let errorOutput = '';

        installProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        installProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        installProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, message: `Успешно установлено: ${packageName}` });
            } else {
                resolve({ success: false, message: `Ошибка установки ${packageName}: ${errorOutput || output}` });
            }
        });

        installProcess.on('error', (error) => {
            reject({ success: false, message: `Ошибка выполнения: ${error.message}` });
        });
    });
});

ipcMain.handle('get-active-interface', async () => {
    return new Promise((resolve) => {
        // Аналог функции из Python версии
        const ipconfig = spawn('ipconfig', [], {
            stdio: 'pipe',
            shell: true,
            encoding: 'cp866' // Для корректной работы с кириллицей в Windows
        });

        let output = '';
        let resolved = false;

        // Таймаут для предотвращения зависания
        const timeout = setTimeout(() => {
            if (!resolved) {
                ipconfig.kill();
                resolve(null);
                resolved = true;
            }
        }, 10000); // 10 секунд таймаут

        ipconfig.stdout.on('data', (data) => {
            output += data.toString();
        });

        ipconfig.on('close', () => {
            if (resolved) return;
            clearTimeout(timeout);
            resolved = true;

            const lines = output.split('\n');
            let currentAdapter = null;

            for (const line of lines) {
                if (line.includes('Адаптер') || line.includes('Adapter')) {
                    currentAdapter = line.split(':')[0].replace('Адаптер', '').replace('Adapter', '').trim();
                } else if (currentAdapter && (line.includes('IPv4') || line.includes('IP Address'))) {
                    resolve(currentAdapter);
                    return;
                }
            }
            resolve(null);
        });

        ipconfig.on('error', () => {
            if (!resolved) {
                clearTimeout(timeout);
                resolved = true;
                resolve(null);
            }
        });
    });
});

ipcMain.handle('check-dns', async () => {
    try {
        const interface = await getActiveInterface();
        if (!interface) {
            return { success: false, message: 'Активный сетевой интерфейс не найден' };
        }

        return await new Promise((resolve) => {
            const netsh = spawn('netsh', ['interface', 'ip', 'show', 'dns', `name="${interface}"`], {
                stdio: 'pipe',
                shell: true,
                encoding: 'utf-8'
            });

            let output = '';

            netsh.stdout.on('data', (data) => {
                output += data.toString();
            });

            netsh.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, interface, dnsInfo: output });
                } else {
                    resolve({ success: false, message: 'Не удалось получить информацию о DNS' });
                }
            });

            netsh.on('error', (error) => {
                resolve({ success: false, message: `Ошибка выполнения команды: ${error.message}` });
            });
        });
    } catch (error) {
        return { success: false, message: `Error: ${error.message}` };
    }
});

ipcMain.handle('set-dns', async () => {
    let primaryDnsSet = false;

    try {
        const interface = await getActiveInterface();
        if (!interface) {
            return { success: false, message: 'Сетевой интерфейс не найден' };
        }

        const dns1 = '176.99.11.77';
        const dns2 = '80.78.247.254';

        // Setting primary DNS
        try {
            await runNetshCommand(['interface', 'ip', 'set', 'dns', `name="${interface}"`, 'static', dns1]);
            primaryDnsSet = true;
        } catch (error) {
            return { success: false, message: `Не удалось установить первичный DNS: ${error.message}` };
        }

        // Setting secondary DNS
        try {
            await runNetshCommand(['interface', 'ip', 'add', 'dns', `name="${interface}"`, dns2, 'index=2']);
        } catch (error) {
            // If secondary DNS fails but primary is set, keep system working with at least one DNS
            console.warn(`Failed to set secondary DNS, but primary DNS is configured: ${error.message}`);
        }

        return { success: true, message: `DNS успешно настроен для интерфейса "${interface}"` };

    } catch (error) {
        // If unexpected error occurs, try to rollback changes
        if (primaryDnsSet) {
            try {
                const interface = await getActiveInterface();
                if (interface) {
                    await runNetshCommand(['interface', 'ip', 'set', 'dns', `name="${interface}"`, 'dhcp']);
                    console.log('DNS rollback performed due to error');
                }
            } catch (rollbackError) {
                console.error('Failed to rollback DNS:', rollbackError);
            }
        }

        return { success: false, message: `Ошибка настройки DNS: ${error.message}` };
    }
});

ipcMain.handle('rollback-dns', async () => {
    try {
        const interface = await getActiveInterface();
        if (!interface) {
            return { success: false, message: 'Сетевой интерфейс не найден' };
        }

        await runNetshCommand(['interface', 'ip', 'set', 'dns', `name="${interface}"`, 'dhcp']);

        return { success: true, message: `DNS сброшен в автоматический режим для интерфейса "${interface}"` };
    } catch (error) {
        return { success: false, message: `Ошибка отката DNS: ${error.message}` };
    }
});

async function getActiveInterface() {
    return new Promise((resolve) => {
        const ipconfig = spawn('ipconfig', [], {
            stdio: 'pipe',
            shell: true,
            encoding: 'cp866'
        });

        let output = '';
        let resolved = false;

        // Таймаут для предотвращения зависания
        const timeout = setTimeout(() => {
            if (!resolved) {
                ipconfig.kill();
                resolve(null);
                resolved = true;
            }
        }, 10000); // 10 секунд таймаут

        ipconfig.stdout.on('data', (data) => {
            output += data.toString();
        });

        ipconfig.on('close', () => {
            if (resolved) return;
            clearTimeout(timeout);
            resolved = true;

            const lines = output.split('\n');
            let currentAdapter = null;
            let bestAdapter = null;
            let hasGateway = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Начинаем новый адаптер
                if (line.includes('Адаптер') || line.includes('Adapter')) {
                    // Сохраняем предыдущий адаптер если у него был шлюз
                    if (currentAdapter && hasGateway) {
                        bestAdapter = currentAdapter;
                    }

                    // Начинаем новый адаптер
                    currentAdapter = line.split(':')[0].replace('Адаптер', '').replace('Adapter', '').trim();
                    hasGateway = false;
                }
                // Проверяем на шлюз по умолчанию (основной критерий)
                else if (currentAdapter && (line.includes('Шлюз') || line.includes('Gateway'))) {
                    const nextLine = lines[i + 1]?.trim() || '';
                    if (nextLine && nextLine !== '' && !nextLine.includes(':')) {
                        hasGateway = true;
                    }
                }
                // Также проверяем на IPv4 адрес как дополнительный критерий
                else if (currentAdapter && (line.includes('IPv4') || line.includes('IP Address')) && !hasGateway) {
                    const nextLine = lines[i + 1]?.trim() || '';
                    if (nextLine && nextLine !== '' && !nextLine.includes(':')) {
                        // Это адаптер с IP, но без шлюза - менее приоритетный
                        if (!bestAdapter) {
                            bestAdapter = currentAdapter;
                        }
                    }
                }
            }

            // Проверяем последний адаптер
            if (currentAdapter && hasGateway) {
                bestAdapter = currentAdapter;
            }

            resolve(bestAdapter);
        });

        ipconfig.on('error', () => {
            if (!resolved) {
                clearTimeout(timeout);
                resolved = true;
                resolve(null);
            }
        });
    });
}

function runNetshCommand(args) {
    return new Promise((resolve, reject) => {
        const netsh = spawn('netsh', args, {
            stdio: 'pipe',
            shell: true
        });

        let resolved = false;

        // Таймаут для предотвращения зависания
        const timeout = setTimeout(() => {
            if (!resolved) {
                netsh.kill();
                reject(new Error('Таймаут выполнения команды'));
                resolved = true;
            }
        }, 15000); // 15 секунд таймаут

        netsh.on('close', (code) => {
            if (resolved) return;
            clearTimeout(timeout);
            resolved = true;

            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`netsh команда завершилась с кодом ${code}`));
            }
        });

        netsh.on('error', (error) => {
            if (!resolved) {
                clearTimeout(timeout);
                resolved = true;
                reject(error);
            }
        });
    });
}

// Получение системной информации
ipcMain.handle('get-system-info', async () => {
    try {
        // Получаем имя пользователя
        const username = process.env.USERNAME || process.env.USER || 'Пользователь';

        // Получаем информацию о Windows
        let windowsVersion = 'Windows';
        try {
            // Используем команду ver для получения версии Windows
            const verOutput = await new Promise((resolve, reject) => {
                const ver = spawn('cmd', ['/c', 'ver'], {
                    stdio: 'pipe',
                    shell: true,
                    encoding: 'cp866'
                });

                let output = '';
                ver.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ver.on('close', (code) => {
                    if (code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error('Не удалось получить версию Windows'));
                    }
                });

                ver.on('error', reject);
            });

            // Парсим версию из вывода
            const versionMatch = verOutput.match(/\[Version (\d+(?:\.\d+)*)\]/);
            if (versionMatch) {
                const versionParts = versionMatch[1].split('.').map(part => parseInt(part, 10));

                // Убеждаемся, что у нас есть хотя бы major и minor версии
                if (versionParts.length >= 2 && !isNaN(versionParts[0]) && !isNaN(versionParts[1])) {
                    const majorVersion = versionParts[0];
                    const minorVersion = versionParts[1];

                    if (majorVersion === 10 && minorVersion >= 22000) {
                        windowsVersion = 'Windows 11';
                    } else if (majorVersion === 10) {
                        windowsVersion = 'Windows 10';
                    } else if (majorVersion === 6 && minorVersion === 3) {
                        windowsVersion = 'Windows 8.1';
                    } else if (majorVersion === 6 && minorVersion === 2) {
                        windowsVersion = 'Windows 8';
                    } else if (majorVersion === 6 && minorVersion === 1) {
                        windowsVersion = 'Windows 7';
                    } else {
                        windowsVersion = `Windows ${majorVersion}`;
                    }
                }
            }
        } catch (error) {
            console.warn('Не удалось определить версию Windows:', error);
            // Оставляем значение по умолчанию
        }

        return {
            username: username,
            windowsVersion: windowsVersion,
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname()
        };
    } catch (error) {
        console.error('Ошибка получения системной информации:', error);
        return {
            username: 'Пользователь',
            windowsVersion: 'Windows',
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname()
        };
    }
});

// Обработчик для перезагрузки системы (требует прав администратора)
ipcMain.handle('reboot-system', async () => {
    return new Promise((resolve) => {
        const shutdown = spawn('shutdown', ['/r', '/t', '15'], {
            stdio: 'pipe',
            shell: true
        });

        shutdown.on('close', (code) => {
            resolve(code === 0);
        });

        shutdown.on('error', () => {
            resolve(false);
        });
    });
});

// Проверка статуса установки нескольких программ
ipcMain.handle('check-multiple-programs-status', async (event, programIds) => {
    const results = {};

    for (const programId of programIds) {
        try {
            const isInstalled = await checkPackageInstalled(programId);
            results[programId] = {
                installed: isInstalled,
                error: null
            };
        } catch (error) {
            results[programId] = {
                installed: false,
                error: error.message
            };
        }
    }

    return results;
});

// Вспомогательная функция для проверки установки (дублирование для удобства)
async function checkPackageInstalled(packageId) {
    return new Promise((resolve) => {
        const winget = spawn('winget', ['list', '--id', packageId, '-e'], {
            stdio: 'pipe',
            shell: true
        });

        winget.on('close', (code) => {
            resolve(code === 0);
        });

        winget.on('error', () => {
            resolve(false);
        });
    });
}

// Обработчики для управления окном
ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
});
