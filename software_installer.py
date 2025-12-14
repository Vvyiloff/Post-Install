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

valorant_installed = False
update_available = False
update_checking = False

# ===================== ПАКЕТЫ =====================

PACKAGES = [
    # Игры
    {"name": "Steam", "id": "Valve.Steam", "group": "Игры"},
    {"name": "Epic Games Launcher", "id": "EpicGames.EpicGamesLauncher", "group": "Игры"},
    {"name": "Ubisoft Connect", "id": "Ubisoft.Connect", "group": "Игры"},
    {"name": "VALORANT (EU)", "id": "RiotGames.Valorant.EU", "group": "Игры", "reboot": True},

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
    return subprocess.run(
        ["winget", "show", "--id", pkg_id, "-e"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    ).returncode == 0

def is_installed(pkg_id):
    return subprocess.run(
        ["winget", "list", "--id", pkg_id, "-e"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    ).returncode == 0

def uninstall_package(pkg_id):
    try:
        result = subprocess.run(
            ["winget", "uninstall", "--id", pkg_id, "-e", "--silent"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except:
        return False

def get_installed_packages():
    """Returns empty list to avoid laggy detection"""
    return []

# ===================== DNS =====================

def is_windows_11():
    return platform.release() == "10" and int(platform.version().split(".")[2]) >= 22000

def get_active_interface():
    out = subprocess.check_output(
        "netsh interface show interface",
        shell=True,
        encoding="utf-8",
        errors="ignore"
    )
    for line in out.splitlines():
        if "Connected" in line:
            return re.split(r"\s{2,}", line.strip())[-1]
    return None

def check_dns():
    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Активный интерфейс не найден")
        return

    dns_info = subprocess.check_output(
        f'netsh interface ip show dns name="{iface}"',
        shell=True,
        encoding="utf-8",
        errors="ignore"
    )

    doh = "Неизвестно"
    if is_windows_11():
        try:
            subprocess.check_output(
                r'reg query "HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\DohWellKnownServers"',
                shell=True
            )
            doh = "Включён"
        except:
            doh = "Выключен"

    messagebox.showinfo(
        "Проверка DNS",
        f"Интерфейс: {iface}\n\n{dns_info}\nDNS over HTTPS: {doh}"
    )

def set_dns():
    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Интерфейс не найден")
        return

    log("DNS SET")
    subprocess.run(f'netsh interface ip set dns name="{iface}" static {DNS1}', shell=True)
    subprocess.run(f'netsh interface ip add dns name="{iface}" {DNS2} index=2', shell=True)

    if is_windows_11():
        for dns in (DNS1, DNS2):
            subprocess.run(
                f'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\DohWellKnownServers\\{dns}" '
                f'/v Template /t REG_SZ /d "{DOH_TEMPLATE}" /f',
                shell=True
            )
            subprocess.run(
                f'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\DohWellKnownServers\\{dns}" '
                f'/v AutoUpgrade /t REG_DWORD /d 2 /f',
                shell=True
            )

    messagebox.showinfo("DNS", "DNS настроен")

def rollback_dns():
    iface = get_active_interface()
    if not iface:
        messagebox.showerror("DNS", "Интерфейс не найден")
        return

    log("DNS ROLLBACK")
    subprocess.run(f'netsh interface ip set dns name="{iface}" dhcp', shell=True)

    if is_windows_11():
        subprocess.run(
            r'reg delete "HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\DohWellKnownServers" /f',
            shell=True
        )

    messagebox.showinfo("DNS", "DNS возвращён в авто")

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

        # Быстрое сравнение только по длине и хэшу
        if len(github_packages) != len(PACKAGES):
            update_available = True
            return github_packages

        # Проверяем только если количество совпадает
        for i, pkg in enumerate(github_packages):
            if pkg != PACKAGES[i]:
                update_available = True
                return github_packages

        update_available = False
        return None

    except (urllib.error.URLError, json.JSONDecodeError, ValueError, Exception) as e:
        log(f"Ошибка загрузки с GitHub: {e}")
        update_available = False
        return None

def save_packages_to_file(packages):
    """Сохраняет список пакетов в локальный файл"""
    try:
        with open(LOCAL_PACKAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(packages, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log(f"Ошибка сохранения пакетов: {e}")
        return False

def load_packages_from_file():
    """Загружает список пакетов из локального файла"""
    try:
        if os.path.exists(LOCAL_PACKAGES_FILE):
            with open(LOCAL_PACKAGES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        log(f"Ошибка загрузки локальных пакетов: {e}")
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
                    # Предлагаем пользователю обновить
                    if messagebox.askyesno("Обновление доступно",
                                         "Доступна новая версия списка программ. Обновить?"):
                        PACKAGES = github_packages
                        refresh_software_list()
                        refresh_installed_list()
                        messagebox.showinfo("Обновлено", "Список программ обновлён!")
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

style = ttk.Style()
style.configure("Header.TLabel", font=("Segoe UI", 12, "bold"))

install_all_var = tk.BooleanVar()
progress = tk.DoubleVar()
status_text = tk.StringVar()
status_text.set("Готово к установке")

items = []

def toggle_install_all():
    for item in items:
        item["var"].set(install_all_var.get())

def apply_profile(profile):
    for item in items:
        item["var"].set(item["pkg"]["group"] == profile)

def refresh_software_list():
    # Clear existing checkboxes
    for widget in box.winfo_children():
        widget.destroy()

    items.clear()

    for pkg in PACKAGES:
        v = tk.BooleanVar()
        ttk.Checkbutton(box, text=f"{pkg['name']} ({pkg['group']})", variable=v).pack(anchor="w")
        items.append({"pkg": pkg, "var": v})

def install_selected():
    global valorant_installed
    selected = [i["pkg"] for i in items if i["var"].get()]

    if not selected:
        messagebox.showwarning("Установка", "Ничего не выбрано")
        return

    step = 100 / len(selected)
    progress.set(0)
    status_text.set("Начало установки...")

    for pkg in selected:
        status_text.set(f"Проверка: {pkg['name']}...")
        root.update_idletasks()

        if is_installed(pkg["id"]):
            status_text.set(f"Уже установлено: {pkg['name']}")
            root.update_idletasks()
            continue

        status_text.set(f"Установка: {pkg['name']}...")
        root.update_idletasks()

        if winget_exists(pkg["id"]):
            status_text.set(f"Загрузка: {pkg['name']}...")
            root.update_idletasks()

            try:
                subprocess.run([
                    "winget", "install",
                    "--id", pkg["id"], "-e",
                    "--silent",
                    "--accept-source-agreements",
                    "--accept-package-agreements"
                ])
                status_text.set(f"Успешно установлено: {pkg['name']}")
            except Exception as e:
                status_text.set(f"Ошибка установки {pkg['name']}: {str(e)}")
        else:
            status_text.set(f"Пакет не найден: {pkg['name']}")

        if pkg.get("reboot"):
            valorant_installed = True

        progress.set(progress.get() + step)
        root.update_idletasks()

    if valorant_installed:
        messagebox.showwarning(
            "Перезагрузка",
            "VALORANT установлен.\nПерезагрузка через 15 секунд."
        )
        subprocess.run("shutdown /r /t 15", shell=True)

# ===== ВКЛАДКИ =====

notebook = ttk.Notebook(root)
tab_soft = ttk.Frame(notebook)
tab_sys = ttk.Frame(notebook)

notebook.add(tab_soft, text="Софт")
notebook.add(tab_sys, text="Система")
notebook.pack(expand=True, fill="both", padx=10, pady=10)

# ===== СОФТ =====

ttk.Label(tab_soft, text="Выбор программ для установки", style="Header.TLabel").pack(pady=5)

box = ttk.Frame(tab_soft)
box.pack(fill="both", expand=True, padx=10)

# Initialize software list
refresh_software_list()

ttk.Separator(tab_soft).pack(fill="x", pady=8)

ttk.Checkbutton(tab_soft, text="Установить всё", variable=install_all_var, command=toggle_install_all).pack()

profiles = ttk.Frame(tab_soft)
profiles.pack(pady=5)

ttk.Button(profiles, text="Игры", command=lambda: apply_profile("Игры")).grid(row=0, column=0, padx=3)
ttk.Button(profiles, text="Разработка", command=lambda: apply_profile("Разработка")).grid(row=0, column=1, padx=3)
ttk.Button(profiles, text="Базовый софт", command=lambda: apply_profile("Базовый софт")).grid(row=0, column=2, padx=3)

ttk.Button(tab_soft, text="Начать установку", command=install_selected).pack(pady=6)

# Frame for progress and status
progress_frame = ttk.Frame(tab_soft)
progress_frame.pack(fill="x", padx=10, pady=10)

# Status label showing current operation
status_label = ttk.Label(progress_frame, textvariable=status_text, anchor="w")
status_label.pack(fill="x")
# Progress bar
progress_bar = ttk.Progressbar(progress_frame, variable=progress, maximum=100)
progress_bar.pack(fill="x", pady=(5, 0))

# ===== СИСТЕМА =====

ttk.Label(tab_sys, text="Сетевые настройки", style="Header.TLabel").pack(pady=10)
ttk.Button(tab_sys, text="Проверить DNS", command=check_dns).pack(pady=5)
ttk.Button(tab_sys, text="Настроить DNS", command=set_dns).pack(pady=5)
ttk.Button(tab_sys, text="Откат DNS", command=rollback_dns).pack(pady=5)
ttk.Button(tab_sys, text="Проверить обновления", command=check_for_updates).pack(pady=5)


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

if not shutil.which("winget"):
    messagebox.showerror("Ошибка", "winget не найден")
else:
    # Start loading packages in background
    load_initial_packages()

    # Show main window immediately (no delay)
    root.mainloop()
