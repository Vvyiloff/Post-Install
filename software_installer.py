import subprocess
import shutil
import os
import platform
import re
import logging
import tkinter as tk
from tkinter import ttk, messagebox
import json
import urllib.request
import urllib.error
import threading
import time
import ctypes
import ipaddress

# ===================== ЛОГ =====================

logging.basicConfig(
    filename="installer.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

def log(msg):
    logging.info(msg)

# Настройки GitHub
GITHUB_REPO = "Vvyiloff/Post-Install"  # Ваш репозиторий
GITHUB_RAW_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/packages.json"
LOCAL_PACKAGES_FILE = "packages.json"

# Настройки DNS
DNS1 = "176.99.11.77"
DNS2 = "80.78.247.254"
DOH_TEMPLATE = "https://xbox-dns.ru/dns-query"

# Иконки для программ (emoji)
PROGRAM_ICONS = {
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
}

# Цвета для категорий
CATEGORY_COLORS = {
    "Игры": "#e74c3c",
    "Разработка": "#3498db",
    "Базовый софт": "#27ae60",
    "Стриминг": "#9b59b6",
    "Коммуникация": "#f39c12",
    "Музыка": "#e91e63",
    "3D-графика": "#607d8b",
    "Графика": "#795548"
}

valorant_installed = False
needs_reboot = False
update_available = False
update_checking = False

def is_admin():
    """Проверка прав администратора"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def validate_package(pkg):
    """Валидация структуры пакета"""
    required_fields = ["name", "id", "group"]
    for field in required_fields:
        if field not in pkg:
            log(f"Пакет не содержит обязательное поле '{field}': {pkg}")
            return False
        if not isinstance(pkg[field], str) or not pkg[field].strip():
            log(f"Поле '{field}' пакета пустое или не является строкой: {pkg}")
            return False

    # Валидация ID пакета (должен содержать точку для разделения publisher.app)
    if "." not in pkg["id"]:
        log(f"Неверный формат ID пакета: {pkg['id']}")
        return False

    return True

def validate_packages_list(packages):
    """Валидация списка пакетов"""
    if not isinstance(packages, list):
        log("Список пакетов не является массивом")
        return False

    if not packages:
        log("Список пакетов пуст")
        return False

    valid_packages = []
    for pkg in packages:
        if validate_package(pkg):
            valid_packages.append(pkg)
        else:
            log(f"Пропускаем некорректный пакет: {pkg}")

    if not valid_packages:
        log("Нет корректных пакетов в списке")
        return False

    return valid_packages

def validate_dns_address(address):
    """Валидация DNS адреса"""
    try:
        ipaddress.ip_address(address)
        return True
    except ValueError:
        return False

def validate_dns_config():
    """Валидация DNS конфигурации"""
    if not validate_dns_address(DNS1):
        log(f"Неверный первичный DNS адрес: {DNS1}")
        return False
    if not validate_dns_address(DNS2):
        log(f"Неверный вторичный DNS адрес: {DNS2}")
        return False
    return True

# ===================== ПАКЕТЫ =====================

PACKAGES = [
    # Игры
    {"name": "Steam", "id": "Valve.Steam", "group": "Игры"},
    {"name": "Epic Games Launcher", "id": "EpicGames.EpicGamesLauncher", "group": "Игры"},
    {"name": "Ubisoft Connect", "id": "Ubisoft.Connect", "group": "Игры"},
    {"name": "VALORANT (EU)", "id": "RiotGames.Valorant.EU", "group": "Игры", "reboot": True, "special": "valorant"},

    # Разработка
    {"name": "Visual Studio Code", "id": "Microsoft.VisualStudioCode", "group": "Разработка"},
    {"name": "Git", "id": "Git.Git", "group": "Разработка"},
    {"name": "Cursor", "id": "Anysphere.Cursor", "group": "Разработка"},
    {"name": "Termius", "id": "Termius.Termius", "group": "Разработка"},
    {"name": "Unity Hub", "id": "Unity.UnityHub", "group": "Разработка"},

    # Базовый софт
    {"name": "Google Chrome", "id": "Google.Chrome", "group": "Базовый софт"},
    {"name": "Telegram", "id": "Telegram.TelegramDesktop", "group": "Базовый софт"},
    {"name": "7-Zip", "id": "7zip.7zip", "group": "Базовый софт"},
    {"name": "VLC", "id": "VideoLAN.VLC", "group": "Базовый софт"},
    {"name": "Paint.NET", "id": "dotPDN.PaintDotNet", "group": "Базовый софт"},
]

# ===================== WINGET =====================

def winget_exists(pkg_id):
    try:
        return subprocess.run(
            ["winget", "show", "--id", pkg_id, "-e"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30
        ).returncode == 0
    except subprocess.TimeoutExpired:
        log(f"Таймаут проверки пакета {pkg_id}")
        return False
    except FileNotFoundError:
        log("winget не найден")
        return False
    except Exception as e:
        log(f"Ошибка проверки пакета {pkg_id}: {e}")
        return False

def is_installed(pkg_id):
    try:
        return subprocess.run(
            ["winget", "list", "--id", pkg_id, "-e"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30
        ).returncode == 0
    except subprocess.TimeoutExpired:
        log(f"Таймаут проверки установки {pkg_id}")
        return False
    except FileNotFoundError:
        log("winget не найден")
        return False
    except Exception as e:
        log(f"Ошибка проверки установки {pkg_id}: {e}")
        return False

def uninstall_package(pkg_id):
    try:
        result = subprocess.run(
            ["winget", "uninstall", "--id", pkg_id, "-e", "--silent"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        log(f"Таймаут удаления {pkg_id}")
        return False
    except FileNotFoundError:
        log("winget не найден")
        return False
    except Exception as e:
        log(f"Ошибка удаления {pkg_id}: {e}")
        return False

def get_installed_packages():
    """Returns empty list to avoid laggy detection"""
    return []

# ===================== DNS =====================

def is_windows_11():
    return platform.release() == "10" and int(platform.version().split(".")[2]) >= 22000

def get_active_interface():
    try:
        # Сначала попробуем получить интерфейс через ipconfig
        out = subprocess.check_output(
            ["ipconfig"],
            encoding="cp866",  # Windows использует cp866 для кириллицы
            errors="replace"
        )

        # Ищем адаптеры с IPv4 адресом (обычно это активные)
        lines = out.splitlines()
        current_adapter = None

        for line in lines:
            line = line.strip()
            if line.startswith("Адаптер") or line.startswith("Adapter"):
                current_adapter = line.split(":")[0].replace("Адаптер", "").replace("Adapter", "").strip()
            elif current_adapter and ("IPv4" in line or "IP Address" in line or "IP-адрес" in line):
                # Нашли активный интерфейс с IP
                return current_adapter

        # Если ipconfig не помог, используем netsh
        out = subprocess.check_output(
            ["netsh", "interface", "show", "interface"],
            encoding="utf-8",
            errors="replace"
        )

        for line in out.splitlines():
            if "Connected" in line and ("Dedicated" in line or "Internal" in line):
                parts = re.split(r"\s{2,}", line.strip())
                if len(parts) >= 4:
                    interface_name = parts[-1]
                    # Проверяем что это не loopback или отключенный интерфейс
                    if not any(x in interface_name.lower() for x in ["loopback", "disconnected", "отключен"]):
                        return interface_name

        return None
    except subprocess.CalledProcessError as e:
        log(f"Ошибка получения интерфейса: {e}")
        return None
    except Exception as e:
        log(f"Неожиданная ошибка при получении интерфейса: {e}")
        return None

def check_dns():
    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Активный интерфейс не найден")
        return

    try:
        dns_info = subprocess.check_output(
            ["netsh", "interface", "ip", "show", "dns", f'name="{iface}"'],
            encoding="utf-8",
            errors="replace"
        )
    except subprocess.CalledProcessError as e:
        messagebox.showerror("DNS", f"Ошибка проверки DNS: {e}")
        return
    except Exception as e:
        messagebox.showerror("DNS", f"Неожиданная ошибка: {e}")
        return

    doh = "Неизвестно"
    if is_windows_11():
        try:
            subprocess.check_output(
                ["reg", "query", r"HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\DohWellKnownServers"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            doh = "Включён"
        except subprocess.CalledProcessError:
            doh = "Выключен"
        except Exception as e:
            log(f"Ошибка проверки DoH: {e}")
            doh = "Ошибка проверки"

    messagebox.showinfo(
        "Проверка DNS",
        f"Интерфейс: {iface}\n\n{dns_info}\nDNS over HTTPS: {doh}"
    )

def set_dns():
    if not is_admin():
        messagebox.showerror("DNS", "Для настройки DNS требуются права администратора")
        return

    if not validate_dns_config():
        messagebox.showerror("DNS", "Некорректная конфигурация DNS")
        return

    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Интерфейс не найден")
        return

    try:
        log("DNS SET")
        # Установка первичного DNS
        result1 = subprocess.run(
            ["netsh", "interface", "ip", "set", "dns", f'name="{iface}"', "static", DNS1],
            capture_output=True,
            text=True
        )
        if result1.returncode != 0:
            messagebox.showerror("DNS", f"Ошибка установки первичного DNS: {result1.stderr}")
            return

        # Установка вторичного DNS
        result2 = subprocess.run(
            ["netsh", "interface", "ip", "add", "dns", f'name="{iface}"', DNS2, "index=2"],
            capture_output=True,
            text=True
        )
        if result2.returncode != 0:
            messagebox.showerror("DNS", f"Ошибка установки вторичного DNS: {result2.stderr}")
            return

        if is_windows_11():
            for dns in (DNS1, DNS2):
                # Настройка DoH Template
                result3 = subprocess.run([
                    "reg", "add",
                    f"HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\DohWellKnownServers\\{dns}",
                    "/v", "Template", "/t", "REG_SZ", "/d", DOH_TEMPLATE, "/f"
                ], capture_output=True, text=True)

                # Настройка AutoUpgrade
                result4 = subprocess.run([
                    "reg", "add",
                    f"HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\DohWellKnownServers\\{dns}",
                    "/v", "AutoUpgrade", "/t", "REG_DWORD", "/d", "2", "/f"
                ], capture_output=True, text=True)

                if result3.returncode != 0 or result4.returncode != 0:
                    log(f"Ошибка настройки DoH для {dns}")

        messagebox.showinfo("DNS", "DNS настроен")

    except Exception as e:
        log(f"Ошибка настройки DNS: {e}")
        messagebox.showerror("DNS", f"Ошибка настройки DNS: {str(e)}")

def rollback_dns():
    if not is_admin():
        messagebox.showerror("DNS", "Для отката DNS требуются права администратора")
        return

    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Интерфейс не найден")
        return

    try:
        log("DNS ROLLBACK")
        # Возврат к DHCP
        result = subprocess.run(
            ["netsh", "interface", "ip", "set", "dns", f'name="{iface}"', "dhcp"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            messagebox.showerror("DNS", f"Ошибка отката DNS: {result.stderr}")
            return

        if is_windows_11():
            # Удаление настроек DoH
            subprocess.run([
                "reg", "delete",
                r"HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\DohWellKnownServers",
                "/f"
            ], capture_output=True)  # Игнорируем ошибки, если ключ не существует

        messagebox.showinfo("DNS", "DNS возвращён в авто")

    except Exception as e:
        log(f"Ошибка отката DNS: {e}")
        messagebox.showerror("DNS", f"Ошибка отката DNS: {str(e)}")

# ===================== GITHUB =====================

def load_packages_from_github():
    """Загружает список пакетов из GitHub (оптимизированная версия)"""
    global PACKAGES, update_available

    try:
        # Быстрая загрузка с GitHub с коротким таймаутом
        req = urllib.request.Request(GITHUB_RAW_URL)
        req.add_header('Cache-Control', 'no-cache')
        req.add_header('Pragma', 'no-cache')

        # Используем короткий таймаут для быстрого отклика
        with urllib.request.urlopen(req, timeout=5) as response:
            data = response.read()

        # Быстрое декодирование и парсинг
        github_packages = json.loads(data.decode('utf-8'))

        # Валидация загруженных пакетов
        validated_packages = validate_packages_list(github_packages)
        if not validated_packages:
            log("Загруженные с GitHub пакеты не прошли валидацию")
            update_available = False
            return None

        # Быстрое сравнение только по длине и хэшу
        if len(validated_packages) != len(PACKAGES):
            update_available = True
            return validated_packages

        # Проверяем только если количество совпадает
        for i, pkg in enumerate(validated_packages):
            if pkg != PACKAGES[i]:
                update_available = True
                return validated_packages

        update_available = False
        return None

    except urllib.error.URLError as e:
        log(f"Ошибка сети при загрузке с GitHub: {e}")
        update_available = False
        return None
    except json.JSONDecodeError as e:
        log(f"Ошибка парсинга JSON с GitHub: {e}")
        update_available = False
        return None
    except ValueError as e:
        log(f"Ошибка валидации данных с GitHub: {e}")
        update_available = False
        return None
    except Exception as e:
        log(f"Неожиданная ошибка загрузки с GitHub: {e}")
        update_available = False
        return None

def save_packages_to_file(packages):
    """Сохраняет список пакетов в локальный файл"""
    try:
        with open(LOCAL_PACKAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(packages, f, ensure_ascii=False, indent=2)
        log(f"Пакеты сохранены в {LOCAL_PACKAGES_FILE}")
        return True
    except PermissionError:
        log(f"Нет прав на запись в {LOCAL_PACKAGES_FILE}")
        return False
    except OSError as e:
        log(f"Ошибка файловой системы при сохранении пакетов: {e}")
        return False
    except (TypeError, ValueError) as e:
        log(f"Ошибка сериализации пакетов: {e}")
        return False
    except Exception as e:
        log(f"Неожиданная ошибка сохранения пакетов: {e}")
        return False

def load_packages_from_file():
    """Загружает список пакетов из локального файла"""
    try:
        if os.path.exists(LOCAL_PACKAGES_FILE):
            with open(LOCAL_PACKAGES_FILE, 'r', encoding='utf-8') as f:
                packages = json.load(f)

            # Валидация загруженных пакетов
            validated_packages = validate_packages_list(packages)
            if validated_packages:
                log(f"Пакеты загружены из {LOCAL_PACKAGES_FILE}")
                return validated_packages
            else:
                log(f"Пакеты из {LOCAL_PACKAGES_FILE} не прошли валидацию")
                return None
    except FileNotFoundError:
        log(f"Файл {LOCAL_PACKAGES_FILE} не найден")
    except PermissionError:
        log(f"Нет прав на чтение {LOCAL_PACKAGES_FILE}")
    except OSError as e:
        log(f"Ошибка файловой системы при загрузке пакетов: {e}")
    except (json.JSONDecodeError, ValueError) as e:
        log(f"Ошибка парсинга JSON в {LOCAL_PACKAGES_FILE}: {e}")
    except Exception as e:
        log(f"Неожиданная ошибка загрузки локальных пакетов: {e}")
    return None

def check_for_updates():
    """Проверяет наличие обновлений в фоновом режиме"""
    global update_checking

    if update_checking:
        return

    update_checking = True

    def update_check_thread():
        global PACKAGES, update_checking
        try:
            github_packages = load_packages_from_github()
            if github_packages:
                # Сохраняем новые пакеты в файл
                if save_packages_to_file(github_packages):
                    # Предлагаем пользователю обновить (в главном потоке)
                    def ask_update():
                        if messagebox.askyesno("Обновление доступно",
                                             "Доступна новая версия списка программ. Обновить?"):
                            PACKAGES = github_packages
                            refresh_software_list()
                            messagebox.showinfo("Обновлено", "Список программ обновлён!")
                    root.after(0, ask_update)
        except Exception as e:
            log(f"Ошибка проверки обновлений: {e}")
        finally:
            update_checking = False

    # Запускаем проверку в отдельном потоке
    threading.Thread(target=update_check_thread, daemon=True).start()


# ===================== GUI =====================

root = tk.Tk()
root.title("Установщик системы")
root.geometry("650x720")
root.resizable(False, False)

# Настройки стиля и темы
style = ttk.Style()

# Основная тема
style.configure("Header.TLabel",
                font=("Segoe UI", 12, "bold"),
                foreground="#2c3e50")

style.configure("TButton",
                font=("Segoe UI", 10),
                padding=8,
                relief="flat")

style.configure("Accent.TButton",
                font=("Segoe UI", 10, "bold"),
                padding=8,
                background="#3498db",
                foreground="white",
                relief="flat")

style.configure("Success.TButton",
                font=("Segoe UI", 10),
                padding=8,
                background="#27ae60",
                foreground="white",
                relief="flat")

style.configure("Danger.TButton",
                font=("Segoe UI", 10),
                padding=8,
                background="#e74c3c",
                foreground="white",
                relief="flat")

style.configure("TCheckbutton",
                font=("Segoe UI", 9))

style.configure("Card.TFrame",
                background="#f8f9fa",
                relief="solid",
                borderwidth=1)

style.configure("CardTitle.TLabel",
                font=("Segoe UI", 10, "bold"),
                background="#f8f9fa",
                foreground="#2c3e50")

style.configure("CardDesc.TLabel",
                font=("Segoe UI", 9),
                background="#f8f9fa",
                foreground="#6c757d")

# Темная тема
def apply_dark_theme():
    style.configure("Header.TLabel",
                    font=("Segoe UI", 12, "bold"),
                    foreground="#ecf0f1",
                    background="#2c3e50")

    style.configure("TButton",
                    font=("Segoe UI", 10),
                    padding=8,
                    background="#34495e",
                    foreground="#ecf0f1",
                    relief="flat")

    style.configure("Accent.TButton",
                    font=("Segoe UI", 10, "bold"),
                    padding=8,
                    background="#3498db",
                    foreground="white",
                    relief="flat")

    style.configure("Card.TFrame",
                    background="#34495e",
                    relief="solid",
                    borderwidth=1)

    style.configure("CardTitle.TLabel",
                    font=("Segoe UI", 10, "bold"),
                    background="#34495e",
                    foreground="#ecf0f1")

    style.configure("CardDesc.TLabel",
                    font=("Segoe UI", 9),
                    background="#34495e",
                    foreground="#bdc3c7")

    root.configure(bg="#2c3e50")

def apply_light_theme():
    style.configure("Header.TLabel",
                    font=("Segoe UI", 12, "bold"),
                    foreground="#2c3e50",
                    background="#ffffff")

    style.configure("TButton",
                    font=("Segoe UI", 10),
                    padding=8,
                    background="#ffffff",
                    foreground="#2c3e50",
                    relief="flat")

    style.configure("Accent.TButton",
                    font=("Segoe UI", 10, "bold"),
                    padding=8,
                    background="#3498db",
                    foreground="white",
                    relief="flat")

    style.configure("Card.TFrame",
                    background="#f8f9fa",
                    relief="solid",
                    borderwidth=1)

    style.configure("CardTitle.TLabel",
                    font=("Segoe UI", 10, "bold"),
                    background="#f8f9fa",
                    foreground="#2c3e50")

    style.configure("CardDesc.TLabel",
                    font=("Segoe UI", 9),
                    background="#f8f9fa",
                    foreground="#6c757d")

    root.configure(bg="#ffffff")

# Переменная для темы
current_theme = "light"

# Система tooltip'ов
tooltips = {}

def create_tooltip(widget, text):
    """Создает tooltip для виджета"""
    def show_tooltip(event):
        tooltip = tk.Toplevel(widget)
        tooltip.wm_overrideredirect(True)
        tooltip.wm_geometry(f"+{event.x_root+10}+{event.y_root+10}")

        label = ttk.Label(tooltip, text=text, background="#ffffe0",
                         relief="solid", borderwidth=1, padding=5)
        label.pack()

        tooltips[widget] = tooltip

    def hide_tooltip(event):
        if widget in tooltips:
            tooltips[widget].destroy()
            del tooltips[widget]

    widget.bind("<Enter>", show_tooltip)
    widget.bind("<Leave>", hide_tooltip)

install_all_var = tk.BooleanVar()
progress = tk.DoubleVar()
status_text = tk.StringVar()
status_text.set("Готово к установке")
search_var = tk.StringVar()
filter_var = tk.StringVar(value="Все")

items = []
installing = False  # Флаг для предотвращения множественных установок

def toggle_install_all():
    for item in items:
        item["var"].set(install_all_var.get())

def apply_profile(profile):
    for item in items:
        item["var"].set(item["pkg"]["group"] == profile)

def create_program_card(parent, pkg):
    """Создает красивую карточку для программы"""
    # Создаем фрейм карточки
    card = ttk.Frame(parent, style="Card.TFrame", padding=10)
    card.pack(fill="x", pady=3, padx=5)

    # Основной контейнер
    main_frame = ttk.Frame(card, style="Card.TFrame")
    main_frame.pack(fill="x")

    # Левая часть - иконка и чекбокс
    left_frame = ttk.Frame(main_frame, style="Card.TFrame")
    left_frame.pack(side="left")

    # Переменная чекбокса
    var = tk.BooleanVar()

    # Чекбокс
    checkbox = ttk.Checkbutton(left_frame, variable=var, style="TCheckbutton")
    checkbox.pack(side="left", padx=(0, 10))

    # Иконка программы
    icon_text = PROGRAM_ICONS.get(pkg["name"], "📦")
    icon_label = ttk.Label(left_frame, text=icon_text, font=("Segoe UI", 20), background="#f8f9fa")
    icon_label.pack(side="left", padx=(0, 10))

    # Правая часть - информация
    right_frame = ttk.Frame(main_frame, style="Card.TFrame")
    right_frame.pack(side="left", fill="x", expand=True)

    # Название программы
    title_label = ttk.Label(right_frame, text=pkg["name"], style="CardTitle.TLabel")
    title_label.pack(anchor="w")

    # Категория с цветом
    category_color = CATEGORY_COLORS.get(pkg["group"], "#6c757d")
    category_label = ttk.Label(right_frame,
                              text=f"🏷️ {pkg['group']}",
                              style="CardDesc.TLabel",
                              foreground=category_color)
    category_label.pack(anchor="w")

    # ID программы (маленький шрифт)
    id_label = ttk.Label(right_frame,
                        text=f"ID: {pkg['id']}",
                        style="CardDesc.TLabel",
                        font=("Segoe UI", 7))
    id_label.pack(anchor="w")

    # Индикатор перезагрузки если нужен
    if pkg.get("reboot"):
        reboot_label = ttk.Label(right_frame,
                                text="🔄 Требуется перезагрузка",
                                style="CardDesc.TLabel",
                                foreground="#e74c3c",
                                font=("Segoe UI", 8, "bold"))
        reboot_label.pack(anchor="w")

    return {"pkg": pkg, "var": var, "card": card}

def refresh_software_list():
    """Обновляет список программ с красивыми карточками"""
    # Clear existing cards
    for widget in box.winfo_children():
        widget.destroy()

    items.clear()

    # Get search query and filter
    search_query = search_var.get().lower()
    filter_category = filter_var.get()

    # Счетчик найденных программ
    found_count = 0

    for pkg in PACKAGES:
        # Apply category filter
        if filter_category != "Все" and pkg["group"] != filter_category:
            continue

        # Apply search filter
        if search_query and search_query not in pkg["name"].lower():
            continue

        # Создаем карточку
        item = create_program_card(box, pkg)
        items.append(item)
        found_count += 1

    # Обновляем информацию о количестве
    if search_query or filter_category != "Все":
        info_label.config(text=f"Найдено: {found_count} программ")
    else:
        info_label.config(text=f"Всего доступно: {len(PACKAGES)} программ")

    # Если ничего не найдено, показываем сообщение
    if found_count == 0:
        no_results = ttk.Label(box,
                              text="🔍 Программы не найдены\nПопробуйте изменить фильтры или поисковый запрос",
                              style="CardDesc.TLabel",
                              font=("Segoe UI", 12),
                              justify="center")
        no_results.pack(pady=40)

def update_status(text):
    """Безопасное обновление статуса из любого потока"""
    def update_with_animation():
        # Добавляем иконку в зависимости от статуса
        if "Ошибка" in text:
            status_text.set(f"❌ {text}")
        elif "Успешно" in text or "завершена" in text:
            status_text.set(f"✅ {text}")
        elif "Установка" in text or "Загрузка" in text:
            status_text.set(f"⚙️ {text}")
        elif "Проверка" in text:
            status_text.set(f"🔍 {text}")
        else:
            status_text.set(f"ℹ️ {text}")

    root.after(0, update_with_animation)

def update_progress(value):
    """Безопасное обновление прогресса из любого потока"""
    root.after(0, lambda: progress.set(value))

def install_thread(selected_packages):
    """Функция установки в отдельном потоке"""
    global valorant_installed, needs_reboot, installing

    try:
        # Проверяем на специальные пакеты требующие перезагрузки
        reboot_packages = [pkg for pkg in selected_packages if pkg.get("reboot")]
        if reboot_packages:
            def ask_reboot_confirm():
                names = ", ".join([pkg["name"] for pkg in reboot_packages])
                return messagebox.askyesno(
                    "Требуется перезагрузка",
                    f"Следующие программы требуют перезагрузки после установки:\n{names}\n\n"
                    "Продолжить установку?"
                )
            # Спрашиваем подтверждение в главном потоке
            confirmed = [False]
            def check_confirm():
                confirmed[0] = ask_reboot_confirm()
            root.after(0, check_confirm)
            # Ждем ответа (простая синхронизация)
            import time
            time.sleep(0.1)
            while not confirmed[0]:
                time.sleep(0.1)

        step = 100 / len(selected_packages)
        update_progress(0)
        update_status("Начало установки...")

        for pkg in selected_packages:
            update_status(f"Проверка: {pkg['name']}")

            if is_installed(pkg["id"]):
                update_status(f"Уже установлено: {pkg['name']}")
                update_progress(progress.get() + step)
                continue

            update_status(f"Установка: {pkg['name']}")

            if winget_exists(pkg["id"]):
                update_status(f"Загрузка: {pkg['name']}")

                try:
                    result = subprocess.run([
                        "winget", "install",
                        "--id", pkg["id"], "-e",
                        "--silent",
                        "--accept-source-agreements",
                        "--accept-package-agreements"
                    ], capture_output=True, text=True, timeout=300)  # 5 минут таймаут

                    if result.returncode == 0:
                        update_status(f"Успешно установлено: {pkg['name']}")
                        if pkg.get("special") == "valorant":
                            valorant_installed = True
                        if pkg.get("reboot"):
                            needs_reboot = True
                    else:
                        update_status(f"Ошибка установки {pkg['name']}: {result.stderr}")

                except subprocess.TimeoutExpired:
                    update_status(f"Таймаут установки {pkg['name']}")
                except Exception as e:
                    update_status(f"Ошибка установки {pkg['name']}: {str(e)}")
            else:
                update_status(f"Пакет не найден: {pkg['name']}")

            update_progress(progress.get() + step)

        # Финализация
        if needs_reboot:
            update_status("Установка завершена. Требуется перезагрузка.")
            root.after(0, lambda: show_reboot_warning())
        else:
            update_status("Установка завершена")

    except Exception as e:
        log(f"Ошибка в потоке установки: {e}")
        update_status(f"Критическая ошибка: {str(e)}")
    finally:
        installing = False

def show_reboot_warning():
    """Показать предупреждение о перезагрузке в главном потоке"""
    message = "Программы требующие перезагрузки были установлены."
    if valorant_installed:
        message = "VALORANT и другие программы требующие перезагрузки были установлены."

    if not is_admin():
        messagebox.showwarning(
            "Перезагрузка",
            f"{message}\nТребуется перезагрузка, но нет прав администратора.\nПерезагрузите компьютер вручную."
        )
        return

    result = messagebox.askyesno(
        "Перезагрузка",
        f"{message}\nПерезагрузить компьютер сейчас?"
    )
    if result:
        try:
            subprocess.run(["shutdown", "/r", "/t", "15"], check=True)
            messagebox.showinfo("Перезагрузка", "Перезагрузка будет выполнена через 15 секунд...")
        except subprocess.CalledProcessError as e:
            log(f"Ошибка принудительной перезагрузки: {e}")
            messagebox.showerror("Перезагрузка", "Не удалось инициировать перезагрузку")
    else:
        messagebox.showinfo("Перезагрузка", "Перезагрузка отменена. Перезагрузите компьютер вручную.")

def install_selected():
    """Запуск установки в отдельном потоке"""
    global installing

    if installing:
        messagebox.showwarning("Установка", "Установка уже выполняется")
        return

    selected = [i["pkg"] for i in items if i["var"].get()]

    if not selected:
        messagebox.showwarning("Установка", "Ничего не выбрано")
        return

    installing = True
    # Запускаем установку в отдельном потоке
    threading.Thread(target=install_thread, args=(selected,), daemon=True).start()

# ===== ВКЛАДКИ =====

notebook = ttk.Notebook(root)
tab_soft = ttk.Frame(notebook)
tab_sys = ttk.Frame(notebook)

notebook.add(tab_soft, text="Софт")
notebook.add(tab_sys, text="Система")
notebook.pack(expand=True, fill="both", padx=10, pady=10)

# ===== СОФТ =====

# Заголовок с красивым оформлением
header_frame = ttk.Frame(tab_soft, style="Card.TFrame", padding=15)
header_frame.pack(fill="x", padx=10, pady=5)

title_label = ttk.Label(header_frame, text="📦 Установщик программ", style="Header.TLabel",
                       font=("Segoe UI", 16, "bold"))
title_label.pack(anchor="w")

subtitle_label = ttk.Label(header_frame, text="Выберите программы для автоматической установки",
                          font=("Segoe UI", 10), foreground="#6c757d", background="#f8f9fa")
subtitle_label.pack(anchor="w", pady=(5, 0))

# Информация о количестве программ
info_label = ttk.Label(header_frame,
                      text=f"Всего доступно: {len(PACKAGES)} программ",
                      font=("Segoe UI", 9, "italic"),
                      foreground="#27ae60",
                      background="#f8f9fa")
info_label.pack(anchor="w", pady=(5, 0))

# Счетчик выбранных программ
selected_label = ttk.Label(header_frame,
                          text="Выбрано: 0 программ",
                          font=("Segoe UI", 9, "bold"),
                          foreground="#3498db",
                          background="#f8f9fa")
selected_label.pack(anchor="w")

def update_selected_count():
    """Обновляет счетчик выбранных программ"""
    selected_count = sum(1 for item in items if item["var"].get())
    selected_label.config(text=f"Выбрано: {selected_count} программ")

    # Обновляем текст кнопки установки (если она уже создана)
    try:
        if selected_count > 0:
            install_button.config(text=f"🚀 Установить {selected_count} программ")
        else:
            install_button.config(text="🚀 Начать установку")
    except NameError:
        # install_button еще не создана, пропускаем
        pass

    # Повторяем обновление
    root.after(500, update_selected_count)

# Запускаем обновление счетчика
update_selected_count()

# Filter frame
filter_frame = ttk.Frame(tab_soft, style="Card.TFrame", padding=10)
filter_frame.pack(fill="x", padx=10, pady=5)

# Поиск
search_frame = ttk.Frame(filter_frame, style="Card.TFrame")
search_frame.pack(fill="x", pady=(0, 10))

search_icon = ttk.Label(search_frame, text="🔍", font=("Segoe UI", 12), background="#f8f9fa")
search_icon.pack(side="left", padx=(0, 5))

search_entry = ttk.Entry(search_frame, textvariable=search_var,
                        font=("Segoe UI", 10))
search_entry.pack(side="left", fill="x", expand=True)
search_entry.bind("<KeyRelease>", lambda e: refresh_software_list())

# Фильтр по категориям
category_frame = ttk.Frame(filter_frame, style="Card.TFrame")
category_frame.pack(fill="x")

category_label = ttk.Label(category_frame, text="🏷️ Категория:",
                          font=("Segoe UI", 10, "bold"), background="#f8f9fa")
category_label.pack(side="left", padx=(0, 10))

categories = ["Все", "Игры", "Разработка", "Базовый софт", "Стриминг", "Коммуникация", "Музыка", "3D-графика", "Графика"]
filter_combobox = ttk.Combobox(category_frame, textvariable=filter_var,
                              values=categories, state="readonly", width=15,
                              font=("Segoe UI", 10))
filter_combobox.pack(side="left")
filter_combobox.bind("<<ComboboxSelected>>", lambda e: refresh_software_list())

box = ttk.Frame(tab_soft)
box.pack(fill="both", expand=True, padx=10)

# Initialize software list
refresh_software_list()

ttk.Separator(tab_soft).pack(fill="x", pady=8)

select_all_cb = ttk.Checkbutton(tab_soft, text="☑️ Установить всё", variable=install_all_var, command=toggle_install_all)
select_all_cb.pack(pady=5)
create_tooltip(select_all_cb, "Выбрать или снять выбор со всех программ")

profiles = ttk.Frame(tab_soft)
profiles.pack(pady=10)

# Кнопки профилей с цветами и tooltip'ами
profile_buttons = [
    ("🎮 Игры", "Игры", "#e74c3c", "Выбрать все игровые программы"),
    ("💻 Разработка", "Разработка", "#3498db", "Выбрать программы для разработчиков"),
    ("📦 Базовый софт", "Базовый софт", "#27ae60", "Выбрать основные программы")
]

for i, (text, profile, color, tooltip_text) in enumerate(profile_buttons):
    btn = ttk.Button(profiles, text=text, command=lambda p=profile: apply_profile(p), style="TButton")
    btn.grid(row=0, column=i, padx=5, pady=2)
    create_tooltip(btn, tooltip_text)
    # Добавляем цвет фона для кнопки профиля
    style.configure(f"{profile}.TButton",
                   font=("Segoe UI", 9, "bold"),
                   padding=6,
                   background=color,
                   foreground="white")

install_button = ttk.Button(tab_soft, text="🚀 Начать установку", command=install_selected, style="Accent.TButton")
install_button.pack(pady=10)
create_tooltip(install_button, "Начать установку выбранных программ")

def update_install_button():
    """Обновление текста кнопки установки"""
    if installing:
        install_button.config(text="Установка...", state="disabled")
    else:
        install_button.config(text="Начать установку", state="normal")
    root.after(1000, update_install_button)  # Проверяем каждую секунду

# Запускаем обновление кнопки
update_install_button()

# Frame for progress and status
progress_frame = ttk.Frame(tab_soft, style="Card.TFrame", padding=15)
progress_frame.pack(fill="x", padx=10, pady=10)

# Заголовок прогресса
progress_title = ttk.Label(progress_frame, text="📊 Прогресс установки", style="Header.TLabel")
progress_title.pack(anchor="w", pady=(0, 10))

# Status label showing current operation
status_label = ttk.Label(progress_frame, textvariable=status_text, anchor="w",
                        font=("Segoe UI", 10), background="#f8f9fa")
status_label.pack(fill="x", pady=(0, 10))

# Progress bar с улучшенным стилем
progress_bar = ttk.Progressbar(progress_frame, variable=progress, maximum=100,
                              style="TProgressbar", length=400)
progress_bar.pack(fill="x", pady=(0, 5))

# Процент завершения
progress_percent = ttk.Label(progress_frame,
                           textvariable=tk.StringVar(value="0%"),
                           font=("Segoe UI", 9, "bold"),
                           background="#f8f9fa",
                           foreground="#27ae60")
progress_percent.pack(anchor="e")

# Функция обновления процента
def update_progress_percent(*args):
    percent = f"{int(progress.get())}%"
    progress_percent.config(text=percent)

progress.trace_add("write", update_progress_percent)

# ===== СИСТЕМА =====

# Сетевые настройки
ttk.Label(tab_sys, text="🌐 Сетевые настройки", style="Header.TLabel").pack(pady=10)

network_frame = ttk.Frame(tab_sys)
network_frame.pack(fill="x", padx=10, pady=5)

dns_check_btn = ttk.Button(network_frame, text="🔍 Проверить DNS", command=check_dns, style="TButton")
dns_check_btn.pack(fill="x", pady=2)
create_tooltip(dns_check_btn, "Проверить текущие настройки DNS и DoH")

dns_set_btn = ttk.Button(network_frame, text="⚙️ Настроить DNS", command=set_dns, style="Accent.TButton")
dns_set_btn.pack(fill="x", pady=2)
create_tooltip(dns_set_btn, "Установить рекомендуемые DNS сервера с поддержкой DoH")

dns_reset_btn = ttk.Button(network_frame, text="🔄 Откат DNS", command=rollback_dns, style="Danger.TButton")
dns_reset_btn.pack(fill="x", pady=2)
create_tooltip(dns_reset_btn, "Вернуть автоматические настройки DNS")

# Обновления
ttk.Label(tab_sys, text="📦 Обновления", style="Header.TLabel").pack(pady=15)
update_btn = ttk.Button(tab_sys, text="🔄 Проверить обновления", command=check_for_updates, style="TButton")
update_btn.pack(pady=5)
create_tooltip(update_btn, "Проверить наличие обновлений списка программ")

# Настройки интерфейса
ttk.Label(tab_sys, text="🎨 Интерфейс", style="Header.TLabel").pack(pady=15)

theme_frame = ttk.Frame(tab_sys)
theme_frame.pack(fill="x", padx=10, pady=5)

def toggle_theme():
    global current_theme
    if current_theme == "light":
        apply_dark_theme()
        current_theme = "dark"
        theme_button.config(text="☀️ Светлая тема")
    else:
        apply_light_theme()
        current_theme = "light"
        theme_button.config(text="🌙 Темная тема")

theme_button = ttk.Button(theme_frame, text="🌙 Темная тема", command=toggle_theme, style="TButton")
theme_button.pack(fill="x", pady=2)
create_tooltip(theme_button, "Переключить между светлой и темной темой интерфейса")


# ===================== START =====================

def load_initial_packages():
    """Load packages from GitHub on startup (asynchronous)"""
    global PACKAGES

    def load_thread():
        global PACKAGES
        try:
            # Try to load from GitHub first (fast timeout)
            github_packages = load_packages_from_github()
            if github_packages:
                PACKAGES = github_packages
                log("Загружены пакеты с GitHub")
                # Update UI on main thread
                root.after(100, refresh_software_list)
                return

            # Fallback to local file
            local_packages = load_packages_from_file()
            if local_packages:
                PACKAGES = local_packages
                log("Загружены пакеты из локального файла")
                # Update UI on main thread
                root.after(100, refresh_software_list)
                return

            log("Используются встроенные пакеты")
            # Update UI on main thread
            root.after(100, refresh_software_list)

        except Exception as e:
            log(f"Ошибка загрузки пакетов: {e}")
            # Update UI on main thread
            root.after(100, refresh_software_list)

    # Start loading in background thread
    threading.Thread(target=load_thread, daemon=True).start()

# Инициализация темы
apply_light_theme()

if not shutil.which("winget"):
    messagebox.showerror("❌ Ошибка", "winget не найден!\nУстановите winget для работы программы.")
else:
    # Start loading packages in background
    load_initial_packages()

    # Show main window immediately (no delay)
    root.mainloop()
