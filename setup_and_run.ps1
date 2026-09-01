<#
.SYNOPSIS
Gestisce l'avvio, l'arresto, lo stato e la reinstallazione dell'applicazione in locale.
.EXAMPLE
.\setup_and_run.ps1 install
.\setup_and_run.ps1 start
.\setup_and_run.ps1 stop
.\setup_and_run.ps1 status
.\setup_and_run.ps1 restart
.\setup_and_run.ps1 uninstall
.\setup_and_run.ps1 autostart-enable
.\setup_and_run.ps1 autostart-disable
#>

param (
    [Parameter(Mandatory=$false, Position=0)]
    [ValidateSet("start", "stop", "status", "restart", "install", "uninstall",
                 "autostart-enable", "autostart-disable", "open", "help")]
    [string]$Action = "help",

    [Parameter(Mandatory=$false)]
    [string]$Port = "8090"
)

$PidFile    = Join-Path $PSScriptRoot ".app_service.json"
$LogFile    = Join-Path $PSScriptRoot "app_service.log"
$ErrLogFile = Join-Path $PSScriptRoot "app_service_error.log"
$TaskName   = "AudioAIAssistant"

# =============================================================================
# Help
# =============================================================================

function Show-Help {
    Write-Host ""
    Write-Host "=== Audio AI Assistant - Script di Gestione ===" -ForegroundColor Cyan
    Write-Host "Uso: .\setup_and_run.ps1 [azione] [-Port <porta>]"
    Write-Host ""
    Write-Host "Azioni disponibili:" -ForegroundColor Yellow
    Write-Host "  install          - Installa dipendenze, collegamento desktop e (opz.) autostart."
    Write-Host "  start            - Avvia l'app in background e verifica che risponda."
    Write-Host "  stop             - Ferma il servizio e libera la porta."
    Write-Host "  status           - Mostra lo stato; se offline mostra i log recenti."
    Write-Host "  restart          - Esegue stop + start in sequenza."
    Write-Host "  uninstall        - Rimuove collegamento, autostart, artefatti (non i sorgenti)."
    Write-Host "  autostart-enable - Abilita avvio automatico al login (Task Scheduler)."
    Write-Host "  autostart-disable- Disabilita avvio automatico al login."
    Write-Host "  help             - Mostra questo messaggio (default)."
    Write-Host ""
    Write-Host "Opzioni:" -ForegroundColor Yellow
    Write-Host "  -Port  Porta su cui esporre l'app (default: 8090)."
    Write-Host "         Esempio: .\setup_and_run.ps1 start -Port 3000"
    Write-Host ""
}

# =============================================================================
# Utility - verifica requisiti
# =============================================================================

function Test-Requirements {
    $missing = @()

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { $missing += "node" }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $npm) { $missing += "npm" }

    if ($missing.Count -eq 0) { return $true }

    Write-Host ""
    Write-Host "Requisiti mancanti: $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "L'app richiede Node.js (include npm) installato su Windows." -ForegroundColor Yellow
    Write-Host "Installa con:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  oppure: https://nodejs.org/en/download" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Dopo l'installazione chiudi e riapri il terminale, poi riprova." -ForegroundColor Yellow
    Write-Host ""
    return $false
}

# =============================================================================
# Utility - processi e porte
# =============================================================================

function Kill-ProcessTree {
    param([int]$ParentId)
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentId" -ErrorAction SilentlyContinue
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
# Utility - verifica avvio con output Vite in tempo reale
# =============================================================================

function Wait-AppReadyVerbose {
    param(
        [string]$Url,
        [string]$LogPath,
        [int]$MaxSeconds = 60
    )

    $start       = Get-Date
    $deadline    = $start.AddSeconds($MaxSeconds)
    $phase       = "Avvio npm dev server..."
    $pct         = 0
    $ready       = $false
    $lastPrinted = ""

    while ((Get-Date) -lt $deadline) {
        if (Test-Path $LogPath) {
            $tail = Get-Content $LogPath -Tail 8 -ErrorAction SilentlyContinue
            foreach ($line in $tail) {
                $trimmed = $line.Trim()
                if (-not $trimmed -or $trimmed -eq $lastPrinted) { continue }
                $lastPrinted = $trimmed

                if ($trimmed -match 'ready in|Local:|➜') {
                    $phase = "Server pronto!"; $pct = 100; $ready = $true
                }
                elseif ($trimmed -match 'Pre-bundling|optimiz') {
                    $phase = "Ottimizzazione dipendenze..."; if ($pct -lt 70) { $pct = 70 }
                }
                elseif ($trimmed -match 'transform|chunks|modules') {
                    $phase = "Compilazione moduli..."; if ($pct -lt 30) { $pct = 30 }
                }
                elseif ($trimmed -match 'vite') {
                    $phase = "Inizializzazione Vite..."; if ($pct -lt 10) { $pct = 10 }
                }

                Write-Host "    $trimmed" -ForegroundColor DarkGray
            }
        }

        $elapsed    = [int]((Get-Date) - $start).TotalSeconds
        $timePct    = [math]::Min(95, [int]($elapsed / $MaxSeconds * 100))
        $displayPct = [math]::Max($pct, $timePct)

        Write-Progress -Activity "Avvio Audio AI Assistant" `
                       -Status "$phase  (${elapsed}s / max ${MaxSeconds}s)" `
                       -PercentComplete $displayPct

        if ($ready) { break }

        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($r.StatusCode -lt 400) { $ready = $true; break }
        } catch {}

        Start-Sleep -Milliseconds 800
    }

    Write-Progress -Activity "Avvio Audio AI Assistant" -Completed
    $elapsed = [int]((Get-Date) - $start).TotalSeconds

    if ($ready) {
        Write-Host ""
        Write-Host "  Server pronto in ${elapsed}s  ->  $Url" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Timeout dopo ${elapsed}s. Ultimi log:" -ForegroundColor Yellow
        Show-ServiceLogs -Lines 20
    }
    return $ready
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
# Scrive uno script .ps1 temporaneo e lo esegue in background.
# Evita Base64-encoded commands che possono generare falsi positivi AV.
# =============================================================================

function Start-PersistentProcess {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [string]$WorkDir,
        [string]$LogPath
    )

    # Crea script temporaneo in una directory controllata
    $tmpDir  = Join-Path $env:TEMP "audio-ai-assistant"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $tmpScript = Join-Path $tmpDir "launcher_$(Get-Random).ps1"

    # Escape delle variabili per il contenuto dello script
    $safeExe  = $Executable  -replace "'", "''"
    $safeDir  = $WorkDir     -replace "'", "''"
    $safeLog  = $LogPath     -replace "'", "''"
    $argsList = ($Arguments | ForEach-Object { "'$($_ -replace "'","''")'" }) -join ' '

    $scriptContent = @"
Set-Location '$safeDir'
& '$safeExe' $argsList *>> '$safeLog'
"@
    Set-Content -Path $tmpScript -Value $scriptContent -Encoding UTF8

    $proc = Start-Process powershell.exe `
        -ArgumentList "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-File", $tmpScript `
        -WindowStyle Hidden -PassThru

    # Rimuove lo script temporaneo dopo 30 secondi (process ha già il file aperto)
    Start-Job -ScriptBlock {
        param($f) Start-Sleep 30; Remove-Item $f -Force -ErrorAction SilentlyContinue
    } -ArgumentList $tmpScript | Out-Null

    return $proc
}

# =============================================================================
# Icone
# =============================================================================

function Get-IconPath {
    $candidates = @(
        (Join-Path $PSScriptRoot "public\favicon.ico"),
        (Join-Path $PSScriptRoot "public\favicon-64.png"),
        (Join-Path $PSScriptRoot "public\favicon.png")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

# =============================================================================
# Collegamento desktop
# =============================================================================

function Install-Shortcuts {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $LnkDest     = Join-Path $DesktopPath "Audio_AI_Assistance.lnk"
    $StartBat    = Join-Path $PSScriptRoot "Start.bat"
    $IconPath    = Get-IconPath

    try {
        $shell = New-Object -ComObject WScript.Shell
        $lnk   = $shell.CreateShortcut($LnkDest)
        # Punta a Start.bat: avvia l'app E apre il browser al termine
        $lnk.TargetPath       = $StartBat
        $lnk.WorkingDirectory = $PSScriptRoot
        $lnk.WindowStyle      = 1
        $lnk.Description      = "Avvia Audio AI Assistant"
        if ($IconPath) {
            $lnk.IconLocation = "$IconPath,0"
        }
        $lnk.Save()
        Write-Host "  Collegamento creato: $LnkDest" -ForegroundColor Green
        if ($IconPath) {
            Write-Host "  Icona: $IconPath" -ForegroundColor DarkGray
        }
    }
    catch {
        Write-Host "  Impossibile creare collegamento: $_" -ForegroundColor Red
    }
}

function Get-ShortcutPath {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    return Join-Path $DesktopPath "Audio_AI_Assistance.lnk"
}

function Remove-Shortcut {
    $lnk = Get-ShortcutPath
    if (Test-Path $lnk) {
        Remove-Item $lnk -Force -ErrorAction SilentlyContinue
        Write-Host "  Collegamento rimosso." -ForegroundColor Green
    }
}

# =============================================================================
# Autostart - Task Scheduler
# =============================================================================

function Enable-Autostart {
    $StartBat = Join-Path $PSScriptRoot "Start.bat"
    try {
        # Rimuove eventuali task precedenti con lo stesso nome
        schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
        schtasks /Create /TN $TaskName `
                 /TR "`"$StartBat`"" `
                 /SC ONLOGON `
                 /RL LIMITED `
                 /F | Out-Null
        Write-Host "  Autostart abilitato (Task Scheduler: $TaskName)" -ForegroundColor Green
    }
    catch {
        Write-Host "  Impossibile abilitare autostart: $_" -ForegroundColor Red
    }
}

function Disable-Autostart {
    $result = schtasks /Query /TN $TaskName 2>$null
    if ($LASTEXITCODE -eq 0) {
        schtasks /Delete /TN $TaskName /F | Out-Null
        Write-Host "  Autostart disabilitato." -ForegroundColor Green
    } else {
        Write-Host "  Autostart non era abilitato." -ForegroundColor DarkGray
    }
}

function Test-AutostartEnabled {
    schtasks /Query /TN $TaskName 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

# =============================================================================
# Open (interattivo - usato dal collegamento desktop)
# =============================================================================

function Open-App {
    $appUrl = "http://127.0.0.1:$Port"

    if (-not (Test-PortListening -PortNum $Port)) {
        Start-AppService
        Start-Process $appUrl
        return
    }

    do {
        Write-Host ""
        Write-Host "Audio AI Assistant e' gia' in esecuzione -> $appUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Cosa vuoi fare?"
        Write-Host "    1) Apri nuova sessione di registrazione"
        Write-Host "    2) Riavvia applicazione"
        Write-Host "    3) Ferma server applicazione"
        Write-Host ""
        $choice = Read-Host "  Scelta [1/2/3]"
        switch ($choice) {
            "1" {
                Write-Host "Apertura browser..." -ForegroundColor Green
                Start-Process $appUrl
                return
            }
            "2" {
                Restart-AppService
                Start-Process $appUrl
                return
            }
            "3" {
                Stop-AppService
                return
            }
            default {
                Write-Host "Scelta non valida. Inserisci 1, 2 o 3." -ForegroundColor Yellow
            }
        }
    } while ($true)
}

# =============================================================================
# Start
# =============================================================================

function Start-AppService {
    if (-not (Test-Requirements)) { return }

    if (Test-PortListening -PortNum $Port) {
        Write-Host "Il servizio e' gia' in ascolto sulla porta $Port." -ForegroundColor Yellow
        Write-Host "Usa 'stop' prima di avviarlo di nuovo, oppure 'restart'." -ForegroundColor Yellow
        return
    }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    $npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

    Write-Host ""
    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    if (-not (Test-Path $NodeModulesPath)) {
        Write-Host "[1/3] Installazione dipendenze npm..." -ForegroundColor Cyan
        Start-Process $npmCmd -ArgumentList "install" -Wait -NoNewWindow `
            -WorkingDirectory $PSScriptRoot
        Write-Host "      Dipendenze installate." -ForegroundColor Green
    }
    else {
        Write-Host "[1/3] Dipendenze presenti, salto." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[2/3] Avvio server React (localhost:$Port)..." -ForegroundColor Cyan
    if (Test-Path $LogFile)    { Remove-Item $LogFile    -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ErrLogFile) { Remove-Item $ErrLogFile -Force -ErrorAction SilentlyContinue }

    $npmArgs = @("run", "dev", "--", "--port", $Port, "--host", "127.0.0.1")
    $npmProc = Start-PersistentProcess -Executable $npmCmd -Arguments $npmArgs `
                   -WorkDir $PSScriptRoot -LogPath $LogFile

    Write-Host ""
    Write-Host "[3/3] Verifica disponibilita'..." -ForegroundColor Cyan
    $appUrl  = "http://127.0.0.1:$Port"
    $isReady = Wait-AppReadyVerbose -Url $appUrl -LogPath $LogFile -MaxSeconds 60

    @{
        Pid       = $npmProc.Id
        Port      = $Port
        StartTime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    } | ConvertTo-Json | Set-Content $PidFile

    if ($isReady) {
        Write-Host "Servizio avviato con successo!" -ForegroundColor Green
    }
}

# =============================================================================
# Stop
# =============================================================================

function Stop-AppService {
    $stopped = $false

    if (Test-Path $PidFile) {
        $info = Get-Content $PidFile | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($info) {
            Write-Host "Arresto servizio (porta $($info.Port))..." -ForegroundColor Cyan
            Kill-ProcessTree -ParentId $info.Pid
            Kill-ProcessByPort -PortNum $info.Port
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }

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
        } else {
            Write-Host "HTTP:    porta aperta, pagina non verificata" -ForegroundColor Yellow
        }
        if (Test-Path $PidFile) {
            $info = Get-Content $PidFile | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($info) { Write-Host "Avviato: $($info.StartTime)" }
        }
        if (Test-AutostartEnabled) {
            Write-Host "Autostart: abilitato (Task: $TaskName)" -ForegroundColor Green
        } else {
            Write-Host "Autostart: disabilitato" -ForegroundColor DarkGray
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
# Install
# =============================================================================

function Install-App {
    Write-Host "=== Installazione Audio AI Assistant ===" -ForegroundColor Cyan

    if (-not (Test-Requirements)) { return }

    $NodeModulesPath = Join-Path $PSScriptRoot "node_modules"
    $reinstallModules = $false

    if (Test-Path $NodeModulesPath) {
        Write-Host ""
        Write-Host "node_modules/ gia' presente." -ForegroundColor Yellow
        $answer = Read-Host "  Reinstallare le dipendenze npm? [y/N]"
        if ($answer -match '^[Yy]$') {
            $reinstallModules = $true
        }
    }

    if ($reinstallModules) {
        Stop-AppService
        Write-Host "Eliminazione node_modules..." -ForegroundColor Yellow
        Remove-Item -Path $NodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $NodeModulesPath) {
            Write-Host "Alcuni file sono bloccati. Chiudi editor e terminali, poi riprova." `
                -ForegroundColor Red
            return
        }
        $LockFile = Join-Path $PSScriptRoot "package-lock.json"
        if (Test-Path $LockFile) {
            Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
        }
        Write-Host "Cartella pulita." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[1/3] Collegamento Desktop..." -ForegroundColor Cyan
    Install-Shortcuts

    Write-Host ""
    if (-not (Test-AutostartEnabled)) {
        $answer = Read-Host "[2/3] Abilitare l'avvio automatico all'accensione/login del PC? [y/N]"
        if ($answer -match '^[Yy]$') {
            Enable-Autostart
        } else {
            Write-Host "      Autostart saltato." -ForegroundColor DarkGray
        }
    } else {
        Write-Host "[2/3] Autostart gia' abilitato." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[3/3] Avvio app..." -ForegroundColor Cyan
    Start-AppService
}

# =============================================================================
# Uninstall
# =============================================================================

function Uninstall-App {
    Write-Host "=== Disinstallazione Audio AI Assistant ===" -ForegroundColor Cyan
    Write-Host "Saranno rimossi: collegamento desktop, autostart, node_modules, dist/, log, .app_service.json" -ForegroundColor Yellow
    Write-Host "NON saranno rimossi: sorgenti (src/, public/), .env, package.json, setup_and_run.ps1" -ForegroundColor Yellow
    Write-Host ""
    $answer = Read-Host "Confermi la disinstallazione? [y/N]"
    if ($answer -notmatch '^[Yy]$') {
        Write-Host "Operazione annullata." -ForegroundColor DarkGray
        return
    }

    Stop-AppService

    if (Test-AutostartEnabled) {
        Write-Host "Rimozione autostart..." -ForegroundColor Cyan
        Disable-Autostart
    }

    $lnk = Get-ShortcutPath
    if (Test-Path $lnk) {
        Write-Host "Rimozione collegamento desktop..." -ForegroundColor Cyan
        Remove-Shortcut
    }

    $itemsToRemove = @(
        (Join-Path $PSScriptRoot "node_modules"),
        (Join-Path $PSScriptRoot "dist"),
        (Join-Path $PSScriptRoot "package-lock.json"),
        $LogFile,
        $ErrLogFile,
        $PidFile
    )

    foreach ($item in $itemsToRemove) {
        if (Test-Path $item) {
            Write-Host "Rimozione: $item" -ForegroundColor Cyan
            Remove-Item -Path $item -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host ""
    Write-Host "Disinstallazione completata." -ForegroundColor Green
    Write-Host "Per reinstallare: .\setup_and_run.ps1 install" -ForegroundColor DarkGray
}

# =============================================================================

switch ($Action) {
    "start"            { Start-AppService }
    "stop"             { Stop-AppService }
    "status"           { Check-AppStatus }
    "restart"          { Restart-AppService }
    "install"          { Install-App }
    "uninstall"        { Uninstall-App }
    "autostart-enable" { Enable-Autostart }
    "autostart-disable"{ Disable-Autostart }
    "open"             { Open-App }
    "help"             { Show-Help }
    Default            { Show-Help }
}
