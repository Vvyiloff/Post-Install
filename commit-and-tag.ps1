# Script for commit and tag version 2.0.0

Write-Host "Preparing release v2.0.0" -ForegroundColor Green

# Check git status
Write-Host "`nChecking changes..." -ForegroundColor Yellow
git status --short

# Add all changes
Write-Host "`nAdding changes..." -ForegroundColor Yellow
git add .

# Create commit
Write-Host "`nCreating commit..." -ForegroundColor Yellow
git commit -m "Release v2.0.0: Refactored project structure and updated GitHub Actions"

# Create tag
Write-Host "`nCreating tag v2.0.0..." -ForegroundColor Yellow
git tag -a "v2.0.0" -m "Release version 2.0.0 - Refactored structure with separate Python and Electron versions"

Write-Host "`nCommit and tag created!" -ForegroundColor Green
Write-Host "`nNow run manually:" -ForegroundColor Cyan
Write-Host "  git push origin main" -ForegroundColor White
Write-Host "  git push origin v2.0.0" -ForegroundColor White
Write-Host "`nGitHub Actions will automatically start build!" -ForegroundColor Green
