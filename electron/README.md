# ⚡ Electron version - Software Installer

Modern version of the installer with graphical interface.

## 📥 Installation

### From release:
1. Скачайте `Software-Installer-3.0.0-Setup.exe` из [Releases](https://github.com/Vvyiloff/Post-Install/releases)
2. Запустите установщик

Или скачайте портативную версию `Software-Installer-Electron-v3.0.0.zip`

### From source code:
```bash
git clone https://github.com/Vvyiloff/Post-Install.git
cd Post-Install/electron
npm install
npm start
```

## 🎯 Usage

1. Launch the application
2. Wait for installed software check
3. Select desired programs (you can use profiles)
4. Click "Start Installation"
5. Monitor progress in the modal window

## 📋 Requirements

- Windows 10/11 (x64)
- winget (Windows Package Manager)
- Node.js 16+ (development only)

## 🔧 Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run build
```

## 📁 Structure

```
electron/
├── main.js              # Electron main process
├── preload.js           # IPC bridge
├── package.json         # Configuration
├── src/
│   ├── index.html       # Interface
│   ├── styles.css       # Styles
│   └── app.js          # Logic
└── assets/
    └── icon.svg         # Icon
```

## 📝 Adding programs

The program list is located in `shared/packages.json` (in the project root).
