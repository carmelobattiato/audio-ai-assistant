<#
.SYNOPSIS
Gestisce l'avvio, l'arresto, lo stato e la reinstallazione dell'applicazione in locale.
.EXAMPLE
.\setup_and_run.ps1 start
.\setup_and_run.ps1 stop
.\setup_and_run.ps1 status
.\setup_and_run.ps1 restart
.\setup_and_run.ps1 reinstall
#>

param (
    [Parameter(Mandatory=$false, Position=0)]
    [ValidateSet("start", "stop", "status", "restart", "reinstall", "help")]
    [string]$Action = "help",

    [Parameter(Mandatory=$false)]
    [string]$Port = "8090"
)

$PidFile    = Join-Path $PSScriptRoot ".app_service.json"
$LogFile    = Join-Path $PSScriptRoot "app_service.log"
$ErrLogFile = Join-Path $PSScriptRoot "app_service_error.log"

# =============================================================================
# Help
# =============================================================================

function Show-Help {
    Write-Host ""
    Write-Host "=== Audio AI Assistant - Script di Gestione ===" -ForegroundColor Cyan
    Write-Host "Uso: .\setup_and_run.ps1 [azione] [-Port <porta>]"
    Write-Host ""
    Write-Host "Azioni disponibili:" -ForegroundColor Yellow
    Write-Host "  start     - Avvia l'app in background e verifica che risponda."
    Write-Host "  stop      - Ferma il servizio e libera la porta."
    Write-Host "  status    - Mostra lo stato; se offline mostra i log recenti."
    Write-Host "  restart   - Esegue stop + start in sequenza."
    Write-Host "  reinstall - Elimina node_modules e riavvia l'installazione."
    Write-Host "  help      - Mostra questo messaggio (default)."
    Write-Host ""
    Write-Host "Opzioni:" -ForegroundColor Yellow
    Write-Host "  -Port  Porta su cui esporre l'app (default: 8090)."
    Write-Host "         Esempio: .\setup_and_run.ps1 start -Port 3000"
    Write-Host ""
}

# =============================================================================
# Utility - processi e porte
# =============================================================================

function Kill-ProcessTree {
    param([int]$ParentId)
    $children = Get-CimInstance Win32_Process |
                Where-Object { $_.ParentProcessId -eq $ParentId }
    foreach ($child in $children) {
        Kill-ProcessTree -ParentId $child.ProcessId
    }
    $proc = Get-Process -Id $ParentId -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
    }
}

function Kill-ProcessByPort {
    param([string]$PortNum)
    $lines = netstat -ano |
             Select-String "LISTENING" |
             Select-String ":$PortNum\b"
    foreach ($line in $lines) {
        $parts = $line.Line.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
        $p = $parts[-1]
        if ($p -match '^\d+$' -and $p -ne "0") {
            Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue
        }
    }
}

function Test-PortListening {
    param([string]$PortNum)
    $result = netstat -ano |
              Select-String "LISTENING" |
              Select-String ":$PortNum\b"
    return ($null -ne $result -and @($result).Count -gt 0)
}

# =============================================================================
# Utility - verifica HTTP con polling
# =============================================================================

function Wait-AppReady {
    param(
        [string]$Url,
        [int]$MaxSeconds = 40
    )
    Write-Host -NoNewline "   Attendo risposta su $Url "
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing `
                        -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -lt 400) {
                Write-Host " [OK]" -ForegroundColor Green
                return $true
            }
        }
        catch { }
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }
    Write-Host " [TIMEOUT]" -ForegroundColor Yellow
    return $false
}

# =============================================================================
# Utility - mostra log
# =============================================================================

function Show-ServiceLogs {
    param([int]$Lines = 25)
    $shown = $false

    if (Test-Path $LogFile) {
        $tail = Get-Content $LogFile -Tail $Lines -ErrorAction SilentlyContinue
        if ($tail) {
            Write-Host ""
            Write-Host "--- Ultimi log app ($LogFile) ---" -ForegroundColor DarkGray
            foreach ($row in $tail) {
                Write-Host "  $row" -ForegroundColor DarkGray
            }
            $shown = $true
        }
    }

    if (Test-Path $ErrLogFile) {
        $errTail = Get-Content $ErrLogFile -Tail $Lines -ErrorAction SilentlyContinue
        if ($errTail) {
            Write-Host ""
            Write-Host "--- Ultimi errori ($ErrLogFile) ---" -ForegroundColor DarkGray
            foreach ($row in $errTail) {
                Write-Host "  $row" -ForegroundColor Red
            }
            $shown = $true
        }
    }

    if (-not $shown) {
        Write-Host "  (nessun log disponibile; l'app potrebbe non aver mai avuto avvio)" `
            -ForegroundColor DarkGray
    }
}

# =============================================================================
# Utility - avvio processo persistente
# Wrappa il comando in un processo PowerShell figlio separato che:
#   - rimane vivo finche' il comando interno gira
#   - non aggancia il terminale padre (nessuna pipe condivisa)
#   - redirige stdout+stderr sul file di log
# =============================================================================

function Start-PersistentProcess {
    param(
        [string]$Executable,
        [string]$Arguments,
        [string]$WorkDir,
        [string]$LogPath
    )

    $script  = "Set-Location '$WorkDir'; & '$Executable' $Arguments *>> '$LogPath'"
    $encoded = [Convert]::ToBase64String(
                   [Text.Encoding]::Unicode.GetBytes($script))

    $proc = Start-Process powershell `
        -ArgumentList "-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encoded" `
        -WindowStyle Hidden -PassThru
    return $proc
}

# =============================================================================
# Shortcut desktop
# =============================================================================

function Install-Shortcuts {
    $LnkSource = Join-Path $PSScriptRoot "Audio_AI_Assistance.lnk"
    if (-not (Test-Path $LnkSource)) {
        Write-Host "  File shortcut non trovato, salto." -ForegroundColor DarkGray
        return
    }
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $LnkDest     = Join-Path $DesktopPath "Audio_AI_Assistance.lnk"
    try {
        Copy-Item -Path $LnkSource -Destination $LnkDest -Force
        Write-Host "  Collegamento copiato sul Desktop." -ForegroundColor Green
    }
    catch {
        Write-Host "  Impossibile copiare il collegamento: $_" -ForegroundColor Red
    }
    try {
        $shell  = New-Object -ComObject Shell.Application
        $folder = $shell.Namespace($DesktopPath)
        $item   = $folder.ParseName("Audio_AI_Assistance.lnk")
        if ($item) { $item.InvokeVerb("taskbarpin") }
    }
    catch { }
}

# =============================================================================
# Start
# =============================================================================

function Start-AppService {
    # Controlla se gia' in esecuzione (porta come fonte di verita')
    if (Test-PortListening -PortNum $Port) {
        Write-Host "Il servizio e' gia' in ascolto sulla porta $Port." -ForegroundColor Yellow
        Write-Host "Usa 'stop' prima di avviarlo di nuovo, oppure 'restart'." -ForegroundColor Yellow
        return
    }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    $useWsl = $false
    $npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
        "npm.cmd"
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        "npm"
    } else {
        $useWsl = $true; $null
    }

    # [1/4] Dipendenze npm
    Write-Host ""
    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    if (-not (Test-Path $NodeModulesPath)) {
        Write-Host "[1/4] Installazione dipendenze npm..." -ForegroundColor Cyan
        if ($useWsl) {
            $wslDir = (& wsl wslpath -u $PSScriptRoot).Trim()
            & wsl bash -c "cd '$wslDir' && npm install"
        } else {
            Start-Process $npmCmd -ArgumentList "install" -Wait -NoNewWindow `
                -WorkingDirectory $PSScriptRoot
        }
        Write-Host "      Dipendenze installate." -ForegroundColor Green
    }
    else {
        Write-Host "[1/4] Dipendenze presenti, salto." -ForegroundColor Green
    }

    # [2/4] Collegamento desktop (controllo indipendente da node_modules)
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $LnkDest     = Join-Path $DesktopPath "Audio_AI_Assistance.lnk"
    if (-not (Test-Path $LnkDest)) {
        Write-Host "[2/4] Installazione collegamento desktop..." -ForegroundColor Cyan
        Install-Shortcuts
    }
    else {
        Write-Host "[2/4] Collegamento gia' installato, salto." -ForegroundColor Green
    }

    # [3/4] Avvio npm dev server
    Write-Host ""
    Write-Host "[3/4] Avvio server React (localhost:$Port)..." -ForegroundColor Cyan
    if (Test-Path $LogFile)    { Remove-Item $LogFile    -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ErrLogFile) { Remove-Item $ErrLogFile -Force -ErrorAction SilentlyContinue }

    if ($useWsl) {
        if (-not $wslDir) { $wslDir = (& wsl wslpath -u $PSScriptRoot).Trim() }
        $wslLog = (& wsl wslpath -u $LogFile).Trim()
        $wslCmd = "cd '$wslDir' && npm run dev -- --port $Port >> '$wslLog' 2>&1"
        $npmProc = Start-Process wsl -ArgumentList @("bash", "-c", $wslCmd) `
                       -WindowStyle Hidden -PassThru
    } else {
        $npmArgs = "run dev -- --port $Port --host 127.0.0.1"
        $npmProc = Start-PersistentProcess -Executable $npmCmd -Arguments $npmArgs `
                       -WorkDir $PSScriptRoot -LogPath $LogFile
    }

    # [4/4] Verifica che l'app risponda via HTTP
    Write-Host ""
    Write-Host "[4/4] Verifica disponibilita'..." -ForegroundColor Cyan
    $appUrl = if ($useWsl) { "http://localhost:$Port" } else { "http://127.0.0.1:$Port" }
    $isReady = Wait-AppReady -Url $appUrl -MaxSeconds 40

    # Salva stato
    @{
        Pid       = $npmProc.Id
        Port      = $Port
        StartTime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    } | ConvertTo-Json | Set-Content $PidFile

    Write-Host ""
    if ($isReady) {
        Write-Host "Servizio avviato con successo!" -ForegroundColor Green
        Write-Host "Accesso: $appUrl" -ForegroundColor Green
    }
    else {
        Write-Host "Servizio avviato ma l'app non risponde ancora." -ForegroundColor Yellow
        Write-Host "Potrebbe essere ancora in compilazione. Log:" -ForegroundColor Yellow
        Show-ServiceLogs -Lines 15
    }
}

# =============================================================================
# Stop
# =============================================================================

function Stop-AppService {
    $stopped = $false

    if (Test-Path $PidFile) {
        $info = Get-Content $PidFile | ConvertFrom-Json
        Write-Host "Arresto servizio (porta $($info.Port))..." -ForegroundColor Cyan
        Kill-ProcessTree -ParentId $info.Pid
        Kill-ProcessByPort -PortNum $info.Port
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }

    # Fallback: forza chiusura se la porta e' ancora occupata
    if (Test-PortListening -PortNum $Port) {
        Write-Host "Porta $Port ancora occupata, forzo la chiusura..." -ForegroundColor Yellow
        Kill-ProcessByPort -PortNum $Port
        $stopped = $true
    }

    if ($stopped) {
        Write-Host "Servizio arrestato." -ForegroundColor Green
    }
    else {
        Write-Host "Nessun servizio in esecuzione trovato." -ForegroundColor DarkGray
    }
}

# =============================================================================
# Status
# =============================================================================

function Check-AppStatus {
    $portUp = Test-PortListening -PortNum $Port

    $httpOk = $false
    if ($portUp) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" `
                     -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            $httpOk = ($r.StatusCode -lt 400)
        }
        catch { }
    }

    if ($portUp -or $httpOk) {
        Write-Host ""
        Write-Host "=== Stato Servizio Audio AI ===" -ForegroundColor Cyan
        Write-Host "Stato:   IN ESECUZIONE" -ForegroundColor Green
        Write-Host "Porta:   $Port"
        Write-Host "Accesso: http://127.0.0.1:$Port"
        if ($httpOk) {
            Write-Host "HTTP:    risponde (200 OK)" -ForegroundColor Green
        }
        else {
            Write-Host "HTTP:    porta aperta, pagina non verificata" -ForegroundColor Yellow
        }

        if (Test-Path $PidFile) {
            $info = Get-Content $PidFile |
                    ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($info) {
                Write-Host "Avviato: $($info.StartTime)"
            }
        }
    }
    else {
        Write-Host "Stato: NON IN ESECUZIONE" -ForegroundColor Red
        Show-ServiceLogs -Lines 25
    }
}

# =============================================================================
# Restart
# =============================================================================

function Restart-AppService {
    Write-Host "=== Riavvio servizio ===" -ForegroundColor Cyan
    Stop-AppService
    Start-Sleep -Seconds 1
    Start-AppService
}

# =============================================================================
# Reinstall
# =============================================================================

function Reinstall-App {
    Write-Host "=== Reinstallazione Pulita ===" -ForegroundColor Cyan
    Stop-AppService

    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    if (Test-Path $NodeModulesPath) {
        Write-Host "Eliminazione node_modules..." -ForegroundColor Yellow
        Remove-Item -Path $NodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $NodeModulesPath) {
            Write-Host "Alcuni file sono bloccati. Chiudi editor e terminali, poi riprova." `
                -ForegroundColor Red
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

# =============================================================================

switch ($Action) {
    "start"     { Start-AppService }
    "stop"      { Stop-AppService }
    "status"    { Check-AppStatus }
    "restart"   { Restart-AppService }
    "reinstall" { Reinstall-App }
    "help"      { Show-Help }
    Default     { Show-Help }
}
