# 🚀 Software Installer

[![Version](https://img.shields.io/badge/version-2.0.5-blue.svg)](https://github.com/Vvyiloff/Post-Install/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows-blue.svg)](https://www.microsoft.com/windows)

Universal software installer for Windows with automatic update support via GitHub. Available in two versions: **Python** (console) and **Electron** (GUI).

## 📋 Table of Contents

- [Features](#-features)
- [Versions](#-versions)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Creating Releases](#-creating-releases)
- [Development](#-development)
- [License](#-license)

## ✨ Features

- ✅ **Software installation via winget** - Uses official Windows Package Manager
- ✅ **Automatic updates** - Downloads software list from GitHub
- ✅ **Two interfaces** - Python (console) and Electron (GUI)
- ✅ **Installed software check** - Automatically detects already installed software
- ✅ **Installation profiles** - Quick category selection (Games, Development, Basic software)
- ✅ **System functions** - DNS management, system information
- ✅ **Detailed logging** - History of all operations with filtering

## 🎯 Versions

### 🐍 Python version (`python/`)
Console application with simple interface.

**Features:**
- Fast startup
- Minimal dependencies
- Easily customizable

📖 [Python version documentation](python/README.md)

### ⚡ Electron version (`electron/`)
Modern application with graphical interface.

**Features:**
- 🎨 Beautiful Material Design interface
- 🌓 Dark and light themes
- 📊 Visual installation progress
- 🔍 Search and program filtering
- 📋 Detailed logs with export

📖 [Electron version documentation](electron/README.md)

## 📥 Installation

### Option 1: Ready-made releases (Recommended)

1. Go to [Releases](https://github.com/Vvyiloff/Post-Install/releases)
2. Download the latest version:
   - **Python:** `Post-Install-Python-v2.0.5.zip`
   - **Electron:** `Software-Installer-2.0.5-Setup.exe` or `Software-Installer-Electron-v2.0.5.zip`

### Option 2: From source code

#### Python version:
```bash
git clone https://github.com/Vvyiloff/Post-Install.git
cd Post-Install/python
python software_installer.py
```

#### Electron version:
```bash
git clone https://github.com/Vvyiloff/Post-Install.git
cd Post-Install/electron
npm install
npm start
```

## 🖥️ Системные требования

- **ОС:** Windows 10/11 (x64)
- **winget:** Windows Package Manager (предустановлен в Windows 10/11)
- **Python:** 3.7+ (для Python версии, только для разработки)
- **Node.js:** 16+ (для Electron версии, только для разработки)

## 🎯 Использование

### Python версия

1. Запустите `Post-Install-Python.exe` или `python software_installer.py`
2. Выберите программы из списка
3. Нажмите Enter для начала установки

### Electron версия

1. Запустите приложение
2. Дождитесь проверки установленных программ
3. Выберите нужные программы (можно использовать профили)
4. Нажмите "Начать установку"
5. Следите за прогрессом в модальном окне

**Дополнительные функции:**
- **Поиск:** Введите название программы
- **Фильтры:** Выберите категорию
- **Профили:** Быстрый выбор категорий
- **Система:** Управление DNS и системная информация
- **Логи:** Просмотр истории операций

## 📁 Project Structure

```
Software-Installer/
├── README.md                    # This file
├── LICENSE                      # MIT License
├── .gitignore                   # Ignored files
├── CHANGELOG.md                 # Changelog
│
├── shared/                      # Shared files
│   └── packages.json           # Software list
│
├── python/                      # Python version
│   ├── software_installer.py   # Main file
│   └── README.md               # Documentation
│
└── electron/                    # Electron version
    ├── main.js                 # Main process
    ├── preload.js              # IPC bridge
    ├── package.json            # Configuration
    ├── src/                    # Interface sources
    ├── assets/                 # Resources
    └── README.md               # Documentation
```

## 🚀 Создание релиза

### Автоматический способ (GitHub Actions)

1. **Обновите версию:**
   - Electron: `electron/package.json` → `version`
   - Python: Обновите в комментариях (если есть)

2. **Создайте тег:**
   ```bash
   git tag -a v1.0.2 -m "Release version 1.0.2"
   git push origin v1.0.2
   ```

3. **GitHub Actions автоматически:**
   - Соберет обе версии
   - Создаст два архива (Python и Electron)
   - Загрузит файлы в Release

### Ручной способ

#### Electron версия:
```bash
cd electron
npm install
npm run build
# Результат в electron/releases/
```

#### Python версия:
```bash
pip install pyinstaller
cd python
pyinstaller --onefile --windowed --name "Post-Install-Python" software_installer.py
# Результат в dist/
```

## 🔧 Разработка

### Добавление новой программы

Отредактируйте файл `shared/packages.json`:

```json
{
  "name": "Название программы",
  "id": "Publisher.App",
  "group": "Категория"
}
```

**Категории:**
- `Игры`
- `Разработка`
- `Базовый софт`
- `Стриминг`
- `Коммуникация`
- `Музыка`
- `3D-графика`
- `Графика`

## 📄 License

This project is distributed under the MIT license. See the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a branch for your feature (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a Pull Request

## 📞 Contacts

- **Author:** Vvyil
- **GitHub:** [Vvyiloff](https://github.com/Vvyiloff)
- **Repository:** [Software-Installer](https://github.com/Vvyiloff/Post-Install)

---

⭐ **If the project was helpful, give it a star!** ⭐

Created with ❤️ for Windows users.
