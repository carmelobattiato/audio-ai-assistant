<#
.SYNOPSIS
Gestisce l'avvio, l'arresto, lo stato e la reinstallazione dell'applicazione in locale.
.EXAMPLE
.\setup_and_run.ps1 start
.\setup_and_run.ps1 stop
.\setup_and_run.ps1 status
.\setup_and_run.ps1 reinstall
#>

param (
    [Parameter(Mandatory=$false, Position=0, HelpMessage="Azione da eseguire: start, stop, status, reinstall, help")]
    [ValidateSet("start", "stop", "status", "reinstall", "help")]
    [string]$Action = "help",

    [Parameter(Mandatory=$false, HelpMessage="Porta su cui esporre l'applicazione (default: 8090)")]
    [string]$Port = "8090"
)

$PidFile = Join-Path $PSScriptRoot ".app_service.json"
$LogFile = Join-Path $PSScriptRoot "app_service.log"
$ErrLogFile = Join-Path $PSScriptRoot "app_service_error.log"

function Show-Help {
    Write-Host "`n=== Run Applicazione AI WEB - Script di Gestione ===" -ForegroundColor Cyan
    Write-Host "Uso: .\setup_and_run.ps1 [azione] [-Port <porta>]`n"
    Write-Host "Azioni disponibili:" -ForegroundColor Yellow
    Write-Host "  start     - Avvia l'applicazione in background su localhost."
    Write-Host "  stop      - Ferma il servizio attivo e libera la porta."
    Write-Host "  status    - Mostra lo stato del servizio e l'URL di accesso."
    Write-Host "  reinstall - Elimina node_modules e riavvia l'installazione pulita."
    Write-Host "  help      - Mostra questo messaggio di aiuto (default se omesso).`n"
    Write-Host "Opzioni:" -ForegroundColor Yellow
    Write-Host "  -Port     - Porta su cui esporre l'applicazione (default: 8090)."
    Write-Host "              Esempio: .\setup_and_run.ps1 start -Port 3000`n"
}

function Kill-ProcessTree($parentId) {
    $children = Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq $parentId
    foreach ($child in $children) {
        Kill-ProcessTree $child.ProcessId
    }
    $proc = Get-Process -Id $parentId -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $parentId -Force -ErrorAction SilentlyContinue
    }
}

function Kill-ProcessByPort($port) {
    $netstat = netstat -ano | Select-String "LISTENING" | Select-String ":$port\b"
    foreach ($line in $netstat) {
        $parts = $line.Line.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
        $pidToKill = $parts[-1]
        if ($pidToKill -ne "0" -and $pidToKill -match '^\d+$') {
            $p = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
            if ($p) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Install-Shortcuts {
    $LnkSource = Join-Path $PSScriptRoot "Audio_AI_Assistance.lnk"
    if (-not (Test-Path $LnkSource)) {
        Write-Host "  File shortcut non trovato nella cartella del progetto, salto." -ForegroundColor DarkGray
        return
    }

    # Desktop path: rispetta la cartella Desktop ridiretta su OneDrive
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $LnkDest = Join-Path $DesktopPath "Audio_AI_Assistance.lnk"

    try {
        Copy-Item -Path $LnkSource -Destination $LnkDest -Force
        Write-Host "  Collegamento copiato sul Desktop." -ForegroundColor Green
    } catch {
        Write-Host "  Impossibile copiare il collegamento sul Desktop: $_" -ForegroundColor Red
    }

    # Pin alla Taskbar tramite verbo Shell (Windows 10/11)
    try {
        $shell = New-Object -ComObject Shell.Application
        $folder = $shell.Namespace($DesktopPath)
        $item = $folder.ParseName("Audio_AI_Assistance.lnk")
        if ($item) {
            $item.InvokeVerb("taskbarpin")
            Write-Host "  Collegamento aggiunto alla barra delle applicazioni." -ForegroundColor Green
        }
    } catch {
        Write-Host "  Pin automatico alla taskbar non riuscito." -ForegroundColor DarkGray
        Write-Host "  Per aggiungerlo manualmente: tasto destro sul collegamento Desktop > Aggiungi alla barra delle applicazioni." -ForegroundColor DarkGray
    }
}

function Start-AppService {
    if (Test-Path $PidFile) {
        $info = Get-Content $PidFile | ConvertFrom-Json
        $proc = Get-Process -Id $info.Pid -ErrorAction SilentlyContinue
        $netstat = netstat -ano | Select-String "LISTENING" | Select-String ":$($info.Port)\b"

        if ($proc -or $netstat) {
            Write-Host "Il servizio e' gia' in esecuzione sulla porta $($info.Port). Usa 'stop' prima di avviarlo di nuovo." -ForegroundColor Yellow
            return
        } else {
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        }
    }

    $npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    if (-not (Test-Path $NodeModulesPath)) {
        Write-Host "`n[1/3] Installazione delle dipendenze in corso (potrebbe richiedere qualche minuto)..." -ForegroundColor Cyan
        Start-Process $npmCmd -ArgumentList "install" -Wait -NoNewWindow
        Write-Host "`n[2/3] Installazione collegamenti..." -ForegroundColor Cyan
        Install-Shortcuts
    } else {
        Write-Host "`n[1/3] Dipendenze gia' presenti, salto l'installazione." -ForegroundColor Green
        Write-Host "[2/3] Collegamento gia' installato in precedenza, salto." -ForegroundColor Green
    }

    Write-Host "`n[3/3] Avvio del server di sviluppo in background (localhost:$Port)..." -ForegroundColor Cyan

    if (Test-Path $LogFile) { Remove-Item $LogFile -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ErrLogFile) { Remove-Item $ErrLogFile -Force -ErrorAction SilentlyContinue }

    $process = Start-Process -FilePath $npmCmd -ArgumentList "run dev -- --port $Port --host 127.0.0.1" -WindowStyle Hidden -RedirectStandardOutput $LogFile -RedirectStandardError $ErrLogFile -PassThru -WorkingDirectory $PSScriptRoot

    $info = @{
        Pid = $process.Id
        Port = $Port
        StartTime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    $info | ConvertTo-Json | Set-Content $PidFile

    Write-Host "Servizio avviato con successo!" -ForegroundColor Green
    Write-Host "L'applicazione e' accessibile solo in locale all'indirizzo: http://127.0.0.1:$Port" -ForegroundColor Green
}

function Stop-AppService {
    if (-not (Test-Path $PidFile)) {
        Write-Host "Nessun servizio risulta in esecuzione dal file di stato." -ForegroundColor Yellow
        return
    }

    $info = Get-Content $PidFile | ConvertFrom-Json
    Write-Host "Arresto del servizio e liberazione della porta $($info.Port)..." -ForegroundColor Cyan
    Kill-ProcessTree $info.Pid
    Kill-ProcessByPort $info.Port
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Servizio arrestato correttamente." -ForegroundColor Green
}

function Check-AppStatus {
    if (-not (Test-Path $PidFile)) {
        Write-Host "Stato: NON IN ESECUZIONE" -ForegroundColor DarkGray
        return
    }

    $info = Get-Content $PidFile | ConvertFrom-Json
    $proc = Get-Process -Id $info.Pid -ErrorAction SilentlyContinue
    $netstat = netstat -ano | Select-String "LISTENING" | Select-String ":$($info.Port)\b"

    if ($proc -or $netstat) {
        Write-Host "=== Stato Servizio Audio AI ===" -ForegroundColor Cyan
        Write-Host "Stato:   IN ESECUZIONE" -ForegroundColor Green
        Write-Host "Porta:   $($info.Port)" 
        Write-Host "Accesso: http://127.0.0.1:$($info.Port)"
        Write-Host "Avviato: $($info.StartTime)"
    } else {
        Write-Host "Stato: NON IN ESECUZIONE (Il processo sembra essersi interrotto in modo anomalo)" -ForegroundColor Red
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Reinstall-App {
    Write-Host "=== Reinstallazione Pulita ===" -ForegroundColor Cyan
    Stop-AppService
    
    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    if (Test-Path $NodeModulesPath) {
        Write-Host "Eliminazione della cartella node_modules in corso..." -ForegroundColor Yellow
        Remove-Item -Path $NodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $NodeModulesPath) {
            Write-Host "Attenzione: Alcuni file sono bloccati. Assicurati che nessun terminale o editor stia usando la cartella." -ForegroundColor Red
            return
        }
    }

    $LockFile = Join-Path $PSScriptRoot "package-lock.json"
    if (Test-Path $LockFile) {
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Cartella pulita. Avvio installazione..." -ForegroundColor Green
    Start-AppService
}

switch ($Action) {
    "start" { Start-AppService }
    "stop" { Stop-AppService }
    "status" { Check-AppStatus }
    "reinstall" { Reinstall-App }
    "help" { Show-Help }
    Default { Show-Help }
}
