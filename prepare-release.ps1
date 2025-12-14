# Скрипт для подготовки релиза
# Использование: .\prepare-release.ps1 -Version "1.0.2"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

Write-Host "🚀 Подготовка релиза v$Version" -ForegroundColor Green

# Обновление версии в Electron
$electronPackageJson = "electron\package.json"
if (Test-Path $electronPackageJson) {
    $package = Get-Content $electronPackageJson | ConvertFrom-Json
    $package.version = $Version
    $package | ConvertTo-Json -Depth 10 | Set-Content $electronPackageJson
    Write-Host "✅ Версия обновлена в electron/package.json" -ForegroundColor Green
}

# Создание тега
Write-Host "📌 Создание тега v$Version..." -ForegroundColor Yellow
git add .
git commit -m "Prepare release v$Version"
git tag -a "v$Version" -m "Release version $Version"
Write-Host "✅ Тег создан" -ForegroundColor Green

Write-Host "`n📤 Отправка на GitHub..." -ForegroundColor Yellow
Write-Host "Выполните вручную:" -ForegroundColor Cyan
Write-Host "  git push origin main" -ForegroundColor White
Write-Host "  git push origin v$Version" -ForegroundColor White
Write-Host "`nGitHub Actions автоматически создаст релиз с двумя архивами!" -ForegroundColor Green

