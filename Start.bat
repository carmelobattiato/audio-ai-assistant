@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

:: Avvia il servizio tramite lo script PowerShell
powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup_and_run.ps1" start

:: Leggi la porta dal file di stato, poi attendi che il server risponda e apri il browser
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command ^
    "$pf = '%SCRIPT_DIR%.app_service.json';" ^
    "if (Test-Path $pf) { $port = (Get-Content $pf | ConvertFrom-Json).Port } else { $port = '8090' };" ^
    "$url = 'http://127.0.0.1:' + $port;" ^
    "Write-Host (\"In attesa che l'app sia pronta su $url ...\") -ForegroundColor Cyan;" ^
    "$ok = $false;" ^
    "for ($i = 0; $i -lt 60; $i++) {" ^
        "try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -EA Stop | Out-Null; $ok = $true; break } catch {};" ^
        "Start-Sleep -Seconds 1" ^
    "};" ^
    "if ($ok) { Write-Host 'Applicazione pronta! Apertura browser...' -ForegroundColor Green; Start-Process $url }" ^
    "else { Write-Host 'Timeout: app non risponde dopo 60 secondi.' -ForegroundColor Red }"
