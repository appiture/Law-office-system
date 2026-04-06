# Law Office Demo System - Startup Script

function Get-PortListenerPids {
    param([int]$Port)

    $pattern = ":$Port\s+.*LISTENING\s+(\d+)\s*$"

    netstat -ano |
        Select-String -Pattern $pattern |
        ForEach-Object {
            if ($_.Matches.Count -gt 0) {
                [int]$_.Matches[0].Groups[1].Value
            }
        } |
        Sort-Object -Unique
}

function Stop-PortListeners {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $pids = Get-PortListenerPids -Port $port
        foreach ($listenerPid in $pids) {
            try {
                $process = Get-Process -Id $listenerPid -ErrorAction Stop
                Write-Host "Stopping $($process.ProcessName) on port $port (PID $listenerPid)..." -ForegroundColor Yellow
                Stop-Process -Id $listenerPid -Force -ErrorAction Stop
            }
            catch {
                Write-Host "Unable to stop process $listenerPid on port $port. $_" -ForegroundColor Red
                exit 1
            }
        }
    }
}

function Start-DemoService {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $proc = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoExit",
            "-Command",
            "Set-Location '$WorkingDirectory'; $Command"
        ) `
        -WorkingDirectory $WorkingDirectory `
        -PassThru

    Write-Host "$Name started (PID $($proc.Id))." -ForegroundColor Green
}

Write-Host "Checking dependencies..."

if (-not (Test-Path "backend/mvnw.cmd")) {
    Write-Host "Error: Maven Wrapper (mvnw.cmd) not found in backend directory." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: NPM is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Resetting demo ports (8080 backend, 5173 frontend)..." -ForegroundColor Cyan
Stop-PortListeners -Ports @(8080, 5173)

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"

Write-Host "Starting backend service..." -ForegroundColor Green
Start-DemoService -Name "Backend" -WorkingDirectory $backendDir -Command ".\mvnw.cmd spring-boot:run"

Write-Host "Starting frontend service..." -ForegroundColor Green
Start-DemoService -Name "Frontend" -WorkingDirectory $frontendDir -Command "npm run dev"

Write-Host ""
Write-Host "Demo launch triggered." -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Backend:  http://localhost:8080/api" -ForegroundColor White
