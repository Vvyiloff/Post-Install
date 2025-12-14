// Основной JavaScript файл приложения
class AppInstaller {
    constructor() {
        this.currentTheme = 'light';
        this.selectedPrograms = new Set();
        this.programs = [];
        this.installing = false;
        this.logs = [];
        this.logFilters = {
            level: 'all',
            search: ''
        };
        this.initialized = false; // Флаг завершения инициализации
        this.activeModals = 0; // Счетчик активных модальных окон

        this.init();
    }

    async init() {
        this.bindEvents();
        this.loadTheme();

        // Показываем экран инициализации
        this.showInitModal();

        // Запускаем асинхронную инициализацию
        await this.initializeApp();

        // Скрываем экран инициализации
        this.hideInitModal();
        this.initialized = true; // Инициализация завершена

        this.updateUI();
    }

    async initializeApp() {
        // Логируем запуск приложения
        this.addLog('Приложение запущено', 'info');

        // Проверяем доступность winget
        this.updateInitStatus('Проверка winget...');
        const wingetAvailable = await window.electronAPI.checkWinget();
        if (!wingetAvailable) {
            this.updateInitStatus('Ошибка: winget не найден');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Показываем ошибку 2 секунды
            this.showNotification('Ошибка: winget не найден. Установите winget для работы приложения.', 'error');
            this.addLog('winget не найден', 'error');
        } else {
            this.addLog('winget доступен', 'success');
        }

        // Загружаем программы и проверяем статус установки
        await this.loadPrograms();

        // Получаем и отображаем системную информацию
        await this.loadSystemInfo();

        // Загружаем логи
        this.loadLogs();
    }

    // Загрузка системной информации
    async loadSystemInfo() {
        try {
            const systemInfo = await window.electronAPI.getSystemInfo();

            // Обновляем информацию в боковом меню
            const usernameElement = document.querySelector('.sidebar-info h3');
            const windowsElement = document.querySelector('.sidebar-info p');

            if (usernameElement) {
                usernameElement.textContent = systemInfo.username;
            }

            if (windowsElement) {
                windowsElement.textContent = systemInfo.windowsVersion;
            }

            this.addLog(`Системная информация загружена: ${systemInfo.username} на ${systemInfo.windowsVersion}`, 'info');
        } catch (error) {
            console.error('Ошибка загрузки системной информации:', error);
            this.addLog('Ошибка загрузки системной информации', 'warning');
        }

        // Настраиваем слушатели событий от main процесса
        this.setupEventListeners();

        // Устанавливаем начальное состояние кнопки maximize
        this.updateMaximizeButton(false);
    }

    bindEvents() {
        // Переключение вкладок
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        // Управление окном
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            window.utils.minimizeWindow();
        });

        document.getElementById('maximizeBtn').addEventListener('click', () => {
            window.utils.maximizeWindow();
            // Иконка обновится автоматически через событие изменения размера
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            window.utils.closeWindow();
        });

        // Двойной клик по заголовку для максимизации/восстановления
        const titleBar = document.querySelector('.title-bar');
        if (titleBar) {
            titleBar.addEventListener('dblclick', (e) => {
                // Не максимизируем если кликнули на кнопки управления
                if (e.target.closest('.window-controls')) return;
                window.utils.maximizeWindow();
            });
        }

        // Переключатель темы
        document.getElementById('themeSwitch').addEventListener('change', (e) => {
            this.toggleTheme(e.target.checked);
        });

        // Поиск и фильтры
        document.getElementById('searchInput').addEventListener('input', () => this.filterPrograms());
        document.getElementById('categoryFilter').addEventListener('change', () => this.filterPrograms());

        // Кнопки действий
        document.getElementById('selectAllBtn').addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('installBtn').addEventListener('click', () => this.startInstallation());

        // Профильные кнопки
        document.querySelectorAll('.profile-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyProfile(btn.dataset.profile));
        });

        // Системные кнопки
        document.getElementById('checkDnsBtn').addEventListener('click', () => this.checkDNS());
        document.getElementById('setDnsBtn').addEventListener('click', () => this.setDNS());
        document.getElementById('rollbackDnsBtn').addEventListener('click', () => this.rollbackDNS());
        document.getElementById('checkUpdatesBtn').addEventListener('click', () => this.checkUpdates());
        document.getElementById('systemInfoBtn').addEventListener('click', () => this.showSystemInfo());

        // Модальные окна
        document.getElementById('progressModalClose').addEventListener('click', () => this.hideModal('progressModal'));
        document.getElementById('confirmCancel').addEventListener('click', () => this.cancelConfirm());
        document.getElementById('confirmOk').addEventListener('click', () => this.confirmAction());

        // Темы в настройках
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => this.setTheme(option.dataset.theme));
        });

        // Обработчики для вкладки логи
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
        document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());
        document.getElementById('logLevelFilter').addEventListener('change', (e) => {
            this.logFilters.level = e.target.value;
            this.renderLogs();
        });
        document.getElementById('logSearchInput').addEventListener('input', (e) => {
            this.logFilters.search = e.target.value.toLowerCase();
            this.renderLogs();
        });
    }

    // Настройка слушателей событий от main процесса
    setupEventListeners() {
        window.electronAPI.onWindowMaximize(() => {
            this.updateMaximizeButton(true);
        });

        window.electronAPI.onWindowUnmaximize(() => {
            this.updateMaximizeButton(false);
        });
    }

    // Обновление иконки кнопки maximize/restore
    updateMaximizeButton(isMaximized) {
        const maximizeBtn = document.getElementById('maximizeBtn');
        const icon = maximizeBtn.querySelector('i');

        if (isMaximized) {
            icon.className = 'fas fa-window-restore';
            maximizeBtn.title = 'Восстановить';
        } else {
            icon.className = 'fas fa-square';
            maximizeBtn.title = 'Развернуть';
        }
    }

    // Загрузка списка программ
    async loadPrograms() {
        // Показываем индикатор загрузки
        this.showNotification('Проверка установленных программ...', 'info');

        // Пытаемся загрузить из shared/packages.json
        try {
            const result = await window.electronAPI.loadPackages();
            if (result.success && result.packages) {
                // Преобразуем формат из packages.json в формат приложения
                this.programs = result.packages.map(pkg => ({
                    name: pkg.name,
                    id: pkg.id,
                    group: pkg.group,
                    icon: this.getIconForProgram(pkg.name),
                    reboot: pkg.reboot || false
                }));
                this.addLog(`Загружено ${this.programs.length} программ из packages.json`, 'success');
            } else {
                // Fallback на встроенный список
                this.programs = this.getDefaultPrograms();
                this.addLog('Используется встроенный список программ', 'info');
            }
        } catch (error) {
            console.error('Ошибка загрузки программ:', error);
            // Fallback на встроенный список
            this.programs = this.getDefaultPrograms();
            this.addLog('Ошибка загрузки packages.json, используется встроенный список', 'warning');
        }

        // Проверяем статус установки программ
        await this.checkProgramsInstallationStatus();

        this.renderPrograms();
        this.updateStats();

        this.showNotification('Программы загружены успешно', 'success');
    }

    // Получение иконки для программы
    getIconForProgram(name) {
        const iconMap = {
            "Steam": "🎮",
            "Epic Games Launcher": "🎯",
            "Ubisoft Connect": "🛡️",
            "VALORANT (EU)": "⚔️",
            "Visual Studio Code": "💻",
            "Git": "🔀",
            "Cursor": "✏️",
            "Termius": "🖥️",
            "Unity Hub": "🎨",
            "Google Chrome": "🌐",
            "Telegram": "💬",
            "7-Zip": "📦",
            "VLC": "🎬",
            "Paint.NET": "🎨",
            "Yandex.Disk": "☁️",
            "OBS Studio": "📹",
            "Discord": "🎧",
            "Spotify": "🎵",
            "Blender": "🎭",
            "GIMP": "🖌️"
        };
        return iconMap[name] || "📦";
    }

    // Встроенный список программ (fallback)
    getDefaultPrograms() {
        return [
            {
                name: "Steam",
                id: "Valve.Steam",
                group: "Игры",
                icon: "🎮"
            },
            {
                name: "Epic Games Launcher",
                id: "EpicGames.EpicGamesLauncher",
                group: "Игры",
                icon: "🎯"
            },
            {
                name: "Ubisoft Connect",
                id: "Ubisoft.Connect",
                group: "Игры",
                icon: "🛡️"
            },
            {
                name: "VALORANT (EU)",
                id: "RiotGames.Valorant.EU",
                group: "Игры",
                icon: "⚔️",
                reboot: true
            },
            {
                name: "Visual Studio Code",
                id: "Microsoft.VisualStudioCode",
                group: "Разработка",
                icon: "💻"
            },
            {
                name: "Git",
                id: "Git.Git",
                group: "Разработка",
                icon: "🔀"
            },
            {
                name: "Cursor",
                id: "Anysphere.Cursor",
                group: "Разработка",
                icon: "✏️"
            },
            {
                name: "Termius",
                id: "Termius.Termius",
                group: "Разработка",
                icon: "🖥️"
            },
            {
                name: "Unity Hub",
                id: "Unity.UnityHub",
                group: "Разработка",
                icon: "🎨"
            },
            {
                name: "Google Chrome",
                id: "Google.Chrome",
                group: "Базовый софт",
                icon: "🌐"
            },
            {
                name: "Telegram",
                id: "Telegram.TelegramDesktop",
                group: "Базовый софт",
                icon: "💬"
            },
            {
                name: "7-Zip",
                id: "7zip.7zip",
                group: "Базовый софт",
                icon: "📦"
            },
            {
                name: "VLC",
                id: "VideoLAN.VLC",
                group: "Базовый софт",
                icon: "🎬"
            },
            {
                name: "Paint.NET",
                id: "dotPDN.PaintDotNet",
                group: "Базовый софт",
                icon: "🎨"
            },
            {
                name: "Yandex.Disk",
                id: "Yandex.Disk",
                group: "Базовый софт",
                icon: "☁️"
            },
            {
                name: "OBS Studio",
                id: "OBSProject.OBSStudio",
                group: "Стриминг",
                icon: "📹"
            },
            {
                name: "Discord",
                id: "Discord.Discord",
                group: "Коммуникация",
                icon: "🎧"
            },
            {
                name: "Spotify",
                id: "Spotify.Spotify",
                group: "Музыка",
                icon: "🎵"
            },
            {
                name: "Blender",
                id: "BlenderFoundation.Blender",
                group: "3D-графика",
                icon: "🎭"
            },
            {
                name: "GIMP",
                id: "GIMP.GIMP.3",
                group: "Графика",
                icon: "🖌️"
            }
        ];
    }

    // Проверка статуса установки программ
    async checkProgramsInstallationStatus() {

        this.renderPrograms();
        this.updateStats();

        this.showNotification('Программы загружены успешно', 'success');
    }

    // Проверка статуса установки программ
    async checkProgramsInstallationStatus() {
        try {
            const programIds = this.programs.map(p => p.id);

            this.updateInitStatus('Проверка установленных программ...');
            this.updateInitProgress(0, programIds.length);

            const statusResults = await window.electronAPI.checkMultipleProgramsStatus(programIds);

            let checkedCount = 0;
            const installedPrograms = [];

            // Добавляем статус установки к каждой программе
            for (const program of this.programs) {
                const status = statusResults[program.id];

                if (status) {
                    program.installed = status.installed;
                    if (status.installed) {
                        installedPrograms.push(program.name);
                    }
                    if (status.error) {
                        this.addLog(`Ошибка проверки ${program.name}: ${status.error}`, 'warning');
                    }
                } else {
                    program.installed = false;
                }

                checkedCount++;
                this.updateInitProgress(checkedCount, programIds.length);
                this.updateInitCurrentProgram(`Проверка: ${program.name}`);

                // Небольшая задержка для визуального эффекта
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Показываем результаты
            const installedCount = installedPrograms.length;
            if (installedCount > 0) {
                this.updateInitStatus(`${installedCount} программ уже установлено`);
                this.addLog(`Найдено ${installedCount} установленных программ: ${installedPrograms.join(', ')}`, 'info');
            } else {
                this.updateInitStatus('Установленных программ не найдено');
                this.addLog('Установленных программ не найдено', 'info');
            }

            // Небольшая пауза перед скрытием
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error('Ошибка при проверке статуса программ:', error);
            this.updateInitStatus('Ошибка при проверке программ');
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.showNotification('Не удалось проверить статус установленных программ', 'warning');

            // Устанавливаем статус false для всех программ в случае ошибки
            this.programs.forEach(program => {
                program.installed = false;
            });
        }
    }

    // Отображение программ
    renderPrograms(programsToShow = this.programs) {
        const grid = document.getElementById('programsGrid');
        grid.innerHTML = '';

        if (programsToShow.length === 0) {
            grid.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>Программы не найдены</h3>
                    <p>Попробуйте изменить фильтры или поисковый запрос</p>
                </div>
            `;
            return;
        }

        programsToShow.forEach(program => {
            const card = this.createProgramCard(program);
            grid.appendChild(card);
        });
    }

    // Создание карточки программы
    createProgramCard(program) {
        const card = document.createElement('div');
        const isSelected = this.selectedPrograms.has(program.id);
        const isInstalled = program.installed || false;

        card.className = `program-card ${isSelected ? 'selected' : ''} ${isInstalled ? 'installed' : ''}`;
        card.dataset.programId = program.id;

        card.innerHTML = `
            <div class="program-header">
                <input type="checkbox"
                       class="program-checkbox"
                       ${isSelected ? 'checked' : ''}
                       ${isInstalled ? 'disabled' : ''}
                       onchange="app.toggleProgram('${program.id}')">
                <div class="program-icon">${program.icon}</div>
                <div class="program-info">
                    <div class="program-name">
                        ${program.name}
                        ${isInstalled ? '<span class="installed-badge"><i class="fas fa-check-circle"></i> Установлено</span>' : ''}
                    </div>
                    <div class="program-category">
                        <i class="fas fa-tag"></i>
                        ${program.group}
                    </div>
                    <div class="program-id">ID: ${program.id}</div>
                    ${program.reboot ? '<div class="program-reboot"><i class="fas fa-exclamation-triangle"></i> Требуется перезагрузка</div>' : ''}
                </div>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('program-checkbox') && !isInstalled) {
                this.toggleProgram(program.id);
            }
        });

        return card;
    }

    // Переключение выбора программы
    toggleProgram(programId) {
        // Находим программу
        const program = this.programs.find(p => p.id === programId);
        if (!program) return;

        // Не позволяем выбирать уже установленные программы
        if (program.installed) {
            this.showNotification(`${program.name} уже установлена`, 'info');
            return;
        }

        if (this.selectedPrograms.has(programId)) {
            this.selectedPrograms.delete(programId);
        } else {
            this.selectedPrograms.add(programId);
        }

        this.updateProgramCard(programId);
        this.updateStats();
        this.updateInstallButton();
    }

    // Обновление карточки программы
    updateProgramCard(programId) {
        const card = document.querySelector(`[data-program-id="${programId}"]`);
        if (card) {
            const checkbox = card.querySelector('.program-checkbox');
            const isSelected = this.selectedPrograms.has(programId);

            card.classList.toggle('selected', isSelected);
            checkbox.checked = isSelected;
        }
    }

    // Выбор/снятие выбора всех программ
    toggleSelectAll() {
        const visiblePrograms = this.getFilteredPrograms();
        const allSelected = visiblePrograms.every(p => this.selectedPrograms.has(p.id));

        if (allSelected) {
            // Снимаем выбор
            visiblePrograms.forEach(p => this.selectedPrograms.delete(p.id));
        } else {
            // Выбираем все
            visiblePrograms.forEach(p => this.selectedPrograms.add(p.id));
        }

        this.renderPrograms(this.getFilteredPrograms());
        this.updateStats();
        this.updateInstallButton();
    }

    // Применение профиля
    applyProfile(profile) {
        this.selectedPrograms.clear();

        const profileMap = {
            'games': ['Игры'],
            'development': ['Разработка'],
            'basics': ['Базовый софт']
        };

        const categories = profileMap[profile] || [];
        this.programs.forEach(program => {
            if (categories.includes(program.group)) {
                this.selectedPrograms.add(program.id);
            }
        });

        this.renderPrograms(this.getFilteredPrograms());
        this.updateStats();
        this.updateInstallButton();

        this.addLog(`Применен профиль: ${profile} (${this.selectedPrograms.size} программ)`, 'info');
    }

    // Фильтрация программ
    filterPrograms() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;

        const filtered = this.programs.filter(program => {
            const matchesSearch = program.name.toLowerCase().includes(searchTerm);
            const matchesCategory = categoryFilter === 'all' || program.group === categoryFilter;
            return matchesSearch && matchesCategory;
        });

        this.renderPrograms(filtered);
        this.updateSelectAllButton(filtered);
    }

    // Получение отфильтрованных программ
    getFilteredPrograms() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;

        return this.programs.filter(program => {
            const matchesSearch = program.name.toLowerCase().includes(searchTerm);
            const matchesCategory = categoryFilter === 'all' || program.group === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }

    // Обновление кнопки "Выбрать все"
    updateSelectAllButton(filteredPrograms) {
        const allSelected = filteredPrograms.length > 0 &&
                           filteredPrograms.every(p => this.selectedPrograms.has(p.id));

        const btn = document.getElementById('selectAllBtn');
        if (allSelected) {
            btn.innerHTML = '<i class="fas fa-square"></i> Снять выбор';
            btn.className = 'btn btn-warning';
        } else {
            btn.innerHTML = '<i class="fas fa-check-square"></i> Выбрать всё';
            btn.className = 'btn btn-outline';
        }
    }

    // Обновление статистики
    updateStats() {
        document.getElementById('totalPrograms').textContent = this.programs.length;
        document.getElementById('selectedPrograms').textContent = this.selectedPrograms.size;
    }

    // Обновление кнопки установки
    updateInstallButton() {
        const btn = document.getElementById('installBtn');
        const count = this.selectedPrograms.size;

        if (count === 0) {
            btn.innerHTML = '<i class="fas fa-rocket"></i> Начать установку';
            btn.disabled = true;
            btn.className = 'btn btn-primary';
        } else {
            btn.innerHTML = `<i class="fas fa-rocket"></i> Установить ${count} программ`;
            btn.disabled = false;
            btn.className = 'btn btn-success';
        }
    }

    // Начало установки
    async startInstallation() {
        if (this.selectedPrograms.size === 0 || this.installing) return;

        // Проверяем, что инициализация завершена
        if (!this.initialized) {
            this.showNotification('Подождите завершения инициализации...', 'warning');
            return;
        }

        // Убеждаемся, что все модальные окна закрыты перед началом
        this.closeAllModals();

        // Получаем список программ для установки
        const programsToInstall = Array.from(this.selectedPrograms)
            .map(id => this.programs.find(p => p.id === id))
            .filter(Boolean);

        // Проверяем на программы требующие перезагрузки
        const rebootPrograms = programsToInstall.filter(p => p.reboot);
        if (rebootPrograms.length > 0) {
            const programNames = rebootPrograms.map(p => p.name).join(', ');
            this.addLog(`Найдены программы требующие перезагрузки: ${programNames}`, 'warning');
            const confirmed = await this.showConfirm(
                `Предупреждение`,
                `Следующие программы требуют перезагрузки: ${programNames}\n\nПродолжить установку?`
            );

            if (!confirmed) {
                this.addLog('Установка отменена пользователем', 'warning');
                return;
            }
        } else {
            // Общее подтверждение установки
            const confirmed = await this.showConfirm(
                `Подтверждение установки`,
                `Вы уверены, что хотите установить ${this.selectedPrograms.size} программ(ы)?\n\n${programsToInstall.map(p => `• ${p.name}`).join('\n')}`
            );

            if (!confirmed) {
                this.addLog('Установка отменена пользователем', 'warning');
                return;
            }
        }

        // Только после подтверждения начинаем установку
        // Небольшая задержка для закрытия модального окна подтверждения
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.addLog(`Начало установки ${this.selectedPrograms.size} программ`, 'info');
        this.installing = true;
        this.showProgressModal(programsToInstall);
        await this.installPrograms(programsToInstall);
    }

    // Установка программ
    async installPrograms(programs) {
        let completed = 0;
        let successCount = 0;
        let errorCount = 0;

        for (const program of programs) {
            this.updateProgress(`Установка: ${program.name}`, completed, programs.length);

            try {
                const result = await window.electronAPI.installPackage(program.id, program.name);

                if (result.success) {
                    this.addToProgressLog(`✅ ${result.message}`);
                    this.addLog(`Успешно установлено: ${program.name}`, 'success');
                    successCount++;
                    // Обновляем статус программы
                    program.installed = true;
                } else {
                    this.addToProgressLog(`❌ ${result.message}`);
                    this.addLog(`Ошибка установки ${program.name}: ${result.message}`, 'error');
                    errorCount++;
                }
            } catch (error) {
                this.addToProgressLog(`❌ Ошибка установки ${program.name}: ${error.message}`);
                this.addLog(`Ошибка установки ${program.name}: ${error.message}`, 'error');
                errorCount++;
            }

            completed++;
            this.updateProgressBar((completed / programs.length) * 100);
        }

        this.installing = false;
        this.updateProgress('Установка завершена', programs.length, programs.length);

        // Логируем завершение установки с правильными счетчиками
        this.addLog(`Установка завершена: ${successCount} успешно, ${errorCount} ошибок`, 'info');

        // Обновляем интерфейс - перерисовываем программы чтобы показать новые установленные
        this.renderPrograms();

        // Проверяем на перезагрузку
        const needsReboot = programs.some(p => p.reboot);
        if (needsReboot) {
            this.addLog('Требуется перезагрузка для завершения установки', 'warning');
            setTimeout(() => {
                this.showRebootPrompt();
            }, 2000);
        } else {
            setTimeout(() => {
                this.hideModal('progressModal');
                if (errorCount === 0) {
                    this.addLog('Все программы установлены успешно', 'success');
                } else {
                    this.addLog(`Установка завершена с ${errorCount} ошибками`, 'warning');
                }
            }, 2000);
        }
    }

    // DNS функции
    async checkDNS() {
        const btn = document.getElementById('checkDnsBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';

        try {
            const result = await window.electronAPI.checkDns();

            if (result.success) {
                document.getElementById('dnsInfo').textContent = result.dnsInfo || 'DNS информация получена';
                this.addLog('DNS проверен успешно', 'success');
            } else {
                document.getElementById('dnsInfo').textContent = result.message;
                this.addLog(`Ошибка проверки DNS: ${result.message}`, 'error');
            }
        } catch (error) {
            document.getElementById('dnsInfo').textContent = `Ошибка: ${error.message}`;
            this.showNotification('Ошибка проверки DNS', 'error');
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> Проверить DNS';
    }

    async setDNS() {
        const confirmed = await this.showConfirm(
            'Настройка DNS',
            'Вы уверены, что хотите изменить настройки DNS?'
        );

        if (!confirmed) return;

        const btn = document.getElementById('setDnsBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Настройка...';

        try {
            const result = await window.electronAPI.setDns();

            if (result.success) {
                this.addLog(result.message, 'success');
            } else {
                this.addLog(result.message, 'error');
            }
        } catch (error) {
            this.addLog(`Ошибка настройки DNS: ${error.message}`, 'error');
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cog"></i> Настроить DNS';
    }

    async rollbackDNS() {
        const confirmed = await this.showConfirm(
            'Откат DNS',
            'Вернуть автоматические настройки DNS?'
        );

        if (!confirmed) return;

        const btn = document.getElementById('rollbackDnsBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Откат...';

        try {
            const result = await window.electronAPI.rollbackDns();

            if (result.success) {
                this.addLog(result.message, 'success');
            } else {
                this.addLog(result.message, 'error');
            }
        } catch (error) {
            this.addLog(`Ошибка отката DNS: ${error.message}`, 'error');
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-undo"></i> Откат DNS';
    }

    async checkUpdates() {
        this.showNotification('Проверка обновлений...', 'info');

        // Имитация проверки обновлений
        setTimeout(() => {
            this.showNotification('Список программ обновлен!', 'success');
        }, 2000);
    }

    showSystemInfo() {
        const info = `
Платформа: ${window.utils.getPlatform()}
Версия: ${window.utils.getVersion()}
Время: ${new Date().toLocaleString()}
        `.trim();

        this.showConfirm('Информация о системе', info);
    }

    // Управление темами
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem('theme', theme);

        // Обновляем активную кнопку темы
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.toggle('active', option.dataset.theme === theme);
        });

        // Обновляем переключатель
        document.getElementById('themeSwitch').checked = theme === 'dark';
    }

    toggleTheme(isDark) {
        this.setTheme(isDark ? 'dark' : 'light');
    }

    // Переключение вкладок
    switchTab(tabId) {
        // Обновляем активную вкладку в меню
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        // Показываем нужную вкладку
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${tabId}Tab`);
        });
    }

    // Модальные окна
    showModal(modalId) {
        // Закрываем все предыдущие модальные окна перед открытием нового
        this.closeAllModals();
        
        this.activeModals = 1;
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById(modalId).style.display = 'block';
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
        
        this.activeModals = Math.max(0, this.activeModals - 1);

        // Скрываем overlay только если нет активных модальных окон
        if (this.activeModals === 0) {
            document.getElementById('modalOverlay').classList.remove('active');
        }
    }

    // Закрытие всех модальных окон
    closeAllModals() {
        const modals = ['initModal', 'progressModal', 'confirmModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
            }
        });
        this.activeModals = 0;
    }

    showProgressModal(programs) {
        // Закрываем все другие модальные окна перед показом прогресса
        this.closeAllModals();
        
        document.getElementById('progressCurrent').textContent = '0';
        document.getElementById('progressTotal').textContent = programs.length;
        document.getElementById('progressLog').innerHTML = '';
        this.updateProgressBar(0);

        this.showModal('progressModal');
    }

    updateProgress(text, current, total) {
        document.getElementById('currentProgram').textContent = text;
        document.getElementById('progressCurrent').textContent = current;
        document.getElementById('progressTotal').textContent = total;
    }

    updateProgressBar(percent) {
        document.getElementById('progressFill').style.width = `${percent}%`;
    }

    addToProgressLog(message) {
        const log = document.getElementById('progressLog');
        const time = new Date().toLocaleTimeString();
        log.innerHTML += `[${time}] ${message}\n`;
        log.scrollTop = log.scrollHeight;
    }

    showConfirm(title, message) {
        return new Promise((resolve) => {
            // Закрываем все другие модальные окна перед показом подтверждения
            const modalsToClose = ['initModal', 'progressModal'];
            modalsToClose.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && modal.style.display !== 'none') {
                    modal.style.display = 'none';
                }
            });
            
            document.getElementById('confirmMessage').textContent = message;
            const confirmHeader = document.querySelector('#confirmModal .modal-header h3');
            if (confirmHeader) {
                confirmHeader.textContent = title;
            }

            this.pendingConfirm = resolve;
            this.showModal('confirmModal');
        });
    }

    confirmAction() {
        if (this.pendingConfirm) {
            this.pendingConfirm(true);
            this.pendingConfirm = null;
        }
        this.hideModal('confirmModal');
    }

    cancelConfirm() {
        if (this.pendingConfirm) {
            this.pendingConfirm(false);
            this.pendingConfirm = null;
        }
        this.hideModal('confirmModal');
    }

    // Управление модальным окном инициализации
    showInitModal() {
        // Закрываем все другие модальные окна перед показом инициализации
        this.closeAllModals();
        document.body.classList.add('initializing');
        this.showModal('initModal');
    }

    hideInitModal() {
        document.body.classList.remove('initializing');
        this.hideModal('initModal');
    }

    updateInitStatus(status) {
        document.getElementById('initStatus').textContent = status;
    }

    updateInitCurrentProgram(programName) {
        document.getElementById('initCurrentProgram').textContent = programName;
    }

    updateInitProgress(current, total) {
        document.getElementById('initCurrent').textContent = current;
        document.getElementById('initTotal').textContent = total;

        const percentage = total > 0 ? (current / total) * 100 : 0;
        document.getElementById('initProgressFill').style.width = `${percentage}%`;
    }

    // Диалог перезагрузки
    async showRebootPrompt() {
        const confirmed = await this.showConfirm(
            'Требуется перезагрузка',
            'Некоторые программы требуют перезагрузки для завершения установки. Перезагрузить компьютер сейчас?'
        );

        if (confirmed) {
            try {
                await window.electronAPI.rebootSystem();
                this.showNotification('Перезагрузка инициирована...', 'warning');
            } catch (error) {
                this.showNotification('Не удалось инициировать перезагрузку', 'error');
            }
        } else {
            this.showNotification('Перезагрузка отменена. Перезагрузите компьютер вручную.', 'info');
        }

        this.hideModal('progressModal');
    }

    // Уведомления с логированием
    showNotification(message, type = 'info') {
        // Логируем уведомление
        this.addLog(message, type);

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const iconMap = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        notification.innerHTML = `
            <i class="fas fa-${iconMap[type]} notification-icon"></i>
            <div class="notification-content">
                <div class="notification-title">${type === 'error' ? 'Ошибка' : type === 'success' ? 'Успех' : type === 'warning' ? 'Предупреждение' : 'Информация'}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.getElementById('notifications').appendChild(notification);

        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        // Кнопка закрытия
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }

    // Система логирования
    addLog(message, level = 'info', details = null) {
        const logEntry = {
            id: Date.now(),
            timestamp: new Date(),
            level: level,
            message: message,
            details: details
        };

        this.logs.unshift(logEntry); // Добавляем в начало массива

        // Ограничиваем количество логов (максимум 1000)
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(0, 1000);
        }

        // Обновляем отображение логов
        this.renderLogs();
        this.updateLogStats();

        // Сохраняем логи в localStorage
        this.saveLogs();
    }

    // Отображение логов
    renderLogs() {
        const container = document.getElementById('logsContent');
        const filteredLogs = this.getFilteredLogs();

        if (filteredLogs.length === 0) {
            container.innerHTML = `
                <div class="log-entry">
                    <div class="log-time">-</div>
                    <div class="log-level info">INFO</div>
                    <div class="log-message">Логи не найдены</div>
                </div>
            `;
            document.getElementById('logsCount').textContent = '0 записей';
            return;
        }

        container.innerHTML = filteredLogs.map(log => `
            <div class="log-entry">
                <div class="log-time">${this.formatLogTime(log.timestamp)}</div>
                <div class="log-level ${log.level}">${log.level.toUpperCase()}</div>
                <div class="log-message">${log.message}</div>
            </div>
        `).join('');

        document.getElementById('logsCount').textContent = `${filteredLogs.length} записей`;
    }

    // Форматирование времени лога
    formatLogTime(timestamp) {
        return timestamp.toLocaleString('ru-RU', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Получение отфильтрованных логов
    getFilteredLogs() {
        return this.logs.filter(log => {
            // Фильтр по уровню
            if (this.logFilters.level !== 'all' && log.level !== this.logFilters.level) {
                return false;
            }

            // Фильтр по поиску
            if (this.logFilters.search && !log.message.toLowerCase().includes(this.logFilters.search)) {
                return false;
            }

            return true;
        });
    }

    // Обновление статистики логов
    updateLogStats() {
        const total = this.logs.length;
        const success = this.logs.filter(log => log.level === 'success').length;
        const warning = this.logs.filter(log => log.level === 'warning').length;
        const error = this.logs.filter(log => log.level === 'error').length;

        document.getElementById('totalLogs').textContent = total;
        document.getElementById('successLogs').textContent = success;
        document.getElementById('warningLogs').textContent = warning;
        document.getElementById('errorLogs').textContent = error;
    }

    // Очистка логов
    clearLogs() {
        const confirmed = confirm('Вы уверены, что хотите очистить все логи? Это действие нельзя отменить.');
        if (confirmed) {
            this.logs = [];
            this.renderLogs();
            this.updateLogStats();
            this.saveLogs();
            this.addLog('Логи очищены пользователем', 'info');
        }
    }

    // Экспорт логов
    exportLogs() {
        const filteredLogs = this.getFilteredLogs();
        const logText = filteredLogs.map(log =>
            `[${this.formatLogTime(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`
        ).join('\n');

        // Создаем Blob с логами
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        // Создаем временную ссылку для скачивания
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addLog('Логи экспортированы', 'info');
    }

    // Сохранение логов в localStorage
    saveLogs() {
        try {
            // Сохраняем только последние 500 логов для экономии места
            const logsToSave = this.logs.slice(0, 500).map(log => ({
                ...log,
                timestamp: log.timestamp.toISOString()
            }));
            localStorage.setItem('appLogs', JSON.stringify(logsToSave));
        } catch (error) {
            console.warn('Не удалось сохранить логи:', error);
        }
    }

    // Загрузка логов из localStorage
    loadLogs() {
        try {
            const savedLogs = localStorage.getItem('appLogs');
            if (savedLogs) {
                const parsedLogs = JSON.parse(savedLogs);
                this.logs = parsedLogs.map(log => ({
                    ...log,
                    timestamp: new Date(log.timestamp)
                }));
                this.renderLogs();
                this.updateLogStats();
            }
        } catch (error) {
            console.warn('Не удалось загрузить логи:', error);
            this.addLog('Ошибка загрузки сохраненных логов', 'warning');
        }
    }

    // Обновление UI
    updateUI() {
        this.updateStats();
        this.updateInstallButton();
    }
}

// Глобальная переменная для доступа из HTML
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new AppInstaller();
});

// Экспорт для использования в HTML
window.app = app;
