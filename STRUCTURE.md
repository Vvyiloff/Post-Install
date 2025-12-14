# 📁 Структура проекта Post-Install

## ✅ Новая структура

```
Post-Install/
├── .github/
│   └── workflows/
│       └── release.yml          # Автоматическая сборка релизов
│
├── shared/                       # Общие файлы
│   └── packages.json            # Список программ (используется обеими версиями)
│
├── python/                       # Python версия (консольная)
│   ├── software_installer.py    # Основной файл
│   └── README.md                # Документация
│
├── electron/                     # Electron версия (GUI)
│   ├── main.js                  # Главный процесс
│   ├── preload.js               # IPC мост
│   ├── package.json             # Конфигурация
│   ├── src/
│   │   ├── index.html           # Интерфейс
│   │   ├── styles.css           # Стили
│   │   └── app.js               # Логика
│   ├── assets/
│   │   └── icon.svg             # Иконка
│   └── README.md                # Документация
│
├── README.md                     # Главная документация
├── LICENSE                       # Лицензия MIT
├── .gitignore                    # Игнорируемые файлы
├── CHANGELOG.md                  # История изменений
├── MIGRATION.md                  # Инструкция по миграции
├── prepare-release.ps1           # Скрипт для создания релиза
└── STRUCTURE.md                  # Этот файл
```

## 📦 Релизы

При создании тега `v*` GitHub Actions автоматически:

1. **Соберет Electron версию:**
   - `Post-Install-Electron-vX.X.X-Setup.exe` (установщик)
   - `Post-Install-Electron-vX.X.X.zip` (портативная версия)

2. **Соберет Python версию:**
   - `Post-Install-Python-vX.X.X.zip` (архив с exe и файлами)

3. **Создаст Release** с обоими архивами

## 🔧 Как добавить программу

Отредактируйте `shared/packages.json`:

```json
{
  "name": "Название программы",
  "id": "Publisher.App",
  "group": "Категория",
  "reboot": false
}
```

Обе версии автоматически загрузят обновленный список!

## 🚀 Создание релиза

### Автоматический способ:

```powershell
.\prepare-release.ps1 -Version "1.0.2"
```

### Ручной способ:

```bash
# 1. Обновите версию в electron/package.json
# 2. Создайте тег
git tag -a v1.0.2 -m "Release v1.0.2"
git push origin main
git push origin v1.0.2
```

GitHub Actions сделает всё остальное!

