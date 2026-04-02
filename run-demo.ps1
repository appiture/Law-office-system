# Law Office Demo System - Startup Script

echo "Checking dependencies..."

if (-not (Test-Path "backend/mvnw.cmd")) {
    Write-Host "Error: Maven Wrapper (mvnw.cmd) not found in backend directory." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: NPM is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

echo "Starting backend and frontend concurrently..."
npm run demo
