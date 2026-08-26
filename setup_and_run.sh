#!/usr/bin/env bash
# =============================================================================
# Audio AI Assistant - Script di Gestione (Linux/macOS)
# SYNOPSIS:
#   ./setup_and_run.sh [azione] [-p|--port porta]
# EXAMPLES:
#   ./setup_and_run.sh install
#   ./setup_and_run.sh start
#   ./setup_and_run.sh stop
#   ./setup_and_run.sh status
#   ./setup_and_run.sh restart
#   ./setup_and_run.sh uninstall
#   ./setup_and_run.sh autostart-enable
#   ./setup_and_run.sh autostart-disable
# =============================================================================

TARGET_DIR="$(pwd)"
SELF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
PID_FILE="$TARGET_DIR/.app_service.json"
LOG_FILE="$TARGET_DIR/app_service.log"
ERR_LOG_FILE="$TARGET_DIR/app_service_error.log"
LAUNCHAGENT_LABEL="com.audio-ai-assistant"
LAUNCHAGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCHAGENT_LABEL}.plist"
SYSTEMD_SERVICE="$HOME/.config/systemd/user/audio-ai-assistant.service"
AUTOSTART_DESKTOP="$HOME/.config/autostart/Audio_AI_Assistance.desktop"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
RESET='\033[0m'

ACTION="${1:-help}"
PORT="8090"

if [[ $# -ge 1 ]]; then shift; fi
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port) PORT="${2:-8090}"; shift 2 ;;
        *) shift ;;
    esac
done

case "$ACTION" in
    start|stop|status|restart|install|uninstall|autostart-enable|autostart-disable|help) ;;
    *) ACTION="help" ;;
esac

# =============================================================================
# Help
# =============================================================================

show_help() {
    echo ""
    echo -e "${CYAN}=== Audio AI Assistant - Script di Gestione ===${RESET}"
    echo "Uso: ./setup_and_run.sh [azione] [-p|--port porta]"
    echo ""
    echo -e "${YELLOW}Azioni disponibili:${RESET}"
    echo "  install          - Installa dipendenze, collegamento desktop e (opz.) autostart."
    echo "  start            - Avvia l'app in background e verifica che risponda."
    echo "  stop             - Ferma il servizio e libera la porta."
    echo "  status           - Mostra lo stato; se offline mostra i log recenti."
    echo "  restart          - Esegue stop + start in sequenza."
    echo "  uninstall        - Rimuove collegamento, autostart, artefatti (non i sorgenti)."
    echo "  autostart-enable - Abilita avvio automatico al login."
    echo "  autostart-disable- Disabilita avvio automatico al login."
    echo "  help             - Mostra questo messaggio (default)."
    echo ""
    echo -e "${YELLOW}Opzioni:${RESET}"
    echo "  -p, --port  Porta su cui esporre l'app (default: 8090)."
    echo "              Esempio: ./setup_and_run.sh start --port 3000"
    echo ""
}

# =============================================================================
# Utility - processi e porte
# =============================================================================

kill_process_tree() {
    local pid="$1"
    local children
    children=$(pgrep -P "$pid" 2>/dev/null) || true
    for child in $children; do
        kill_process_tree "$child"
    done
    kill -9 "$pid" 2>/dev/null || true
}

kill_process_by_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null) || true
    if [[ -n "$pids" ]]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
}

test_port_listening() {
    local port="$1"
    lsof -i :"$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

# =============================================================================
# Utility - verifica avvio con output Vite in tempo reale
# =============================================================================

wait_app_ready_verbose() {
    local url="$1"
    local log_path="$2"
    local max_seconds="${3:-60}"

    local start=$SECONDS
    local deadline=$((SECONDS + max_seconds))
    local phase="Avvio npm dev server..."
    local pct=0
    local ready=false
    local last_line_count=0
    local last_printed=""

    # Costruisce una stringa barra senza subshell (no seq)
    _make_bar() {
        local filled="$1" empty="$2"
        local bar=""
        local i
        for ((i=0; i<filled; i++)); do bar+="#"; done
        for ((i=0; i<empty; i++)); do bar+="-"; done
        printf '%s' "$bar"
    }

    _draw_progress() {
        local elapsed=$(( SECONDS - start ))
        local bar_width=30
        local filled=$(( pct * bar_width / 100 ))
        local empty=$(( bar_width - filled ))
        local bar
        bar=$(_make_bar "$filled" "$empty")
        printf "\r  [%-*s] %3d%%  %s  (%ds)   " "$bar_width" "$bar" "$pct" "$phase" "$elapsed"
    }

    echo ""
    while [[ $SECONDS -lt $deadline ]]; do
        if [[ -f "$log_path" ]]; then
            local current_lines
            current_lines=$(wc -l < "$log_path" 2>/dev/null || echo 0)
            current_lines=$(( current_lines + 0 ))

            if [[ $current_lines -gt $last_line_count ]]; then
                local new_lines
                new_lines=$(tail -n "+$((last_line_count + 1))" "$log_path" 2>/dev/null)
                last_line_count=$current_lines

                while IFS= read -r line; do
                    local trimmed="${line#"${line%%[![:space:]]*}"}"
                    [[ -z "$trimmed" || "$trimmed" == "$last_printed" ]] && continue
                    last_printed="$trimmed"

                    if [[ "$trimmed" =~ ready\ in|Local:|➜ ]]; then
                        phase="Server pronto!"; pct=100; ready=true
                    elif [[ "$trimmed" =~ Pre-bundling|optimiz ]]; then
                        phase="Ottimizzazione dipendenze..."; [[ $pct -lt 70 ]] && pct=70
                    elif [[ "$trimmed" =~ transform|chunks|modules ]]; then
                        phase="Compilazione moduli..."; [[ $pct -lt 30 ]] && pct=30
                    elif [[ "$trimmed" =~ vite ]]; then
                        phase="Inizializzazione Vite..."; [[ $pct -lt 10 ]] && pct=10
                    fi

                    printf "\r%-80s\n" ""
                    echo -e "    ${GRAY}$trimmed${RESET}"
                done <<< "$new_lines"
            fi
        fi

        local elapsed=$(( SECONDS - start ))
        local time_pct=$(( elapsed * 100 / max_seconds ))
        [[ $time_pct -gt 95 ]] && time_pct=95
        [[ $time_pct -gt $pct ]] && pct=$time_pct

        _draw_progress

        if [[ "$ready" == true ]]; then break; fi

        if curl -sf --max-time 1 "$url" >/dev/null 2>&1; then
            ready=true; pct=100; phase="Server pronto!"
            _draw_progress
            break
        fi

        sleep 0.8
    done

    printf "\n"
    local elapsed=$(( SECONDS - start ))

    if [[ "$ready" == true ]]; then
        echo -e ""
        echo -e "  ${GREEN}Server pronto in ${elapsed}s  →  $url${RESET}"
    else
        echo -e ""
        echo -e "  ${YELLOW}Timeout dopo ${elapsed}s. Ultimi log:${RESET}"
        show_service_logs 20
    fi

    [[ "$ready" == true ]]
}

# =============================================================================
# Utility - mostra log
# =============================================================================

show_service_logs() {
    local lines="${1:-25}"
    local shown=false

    if [[ -f "$LOG_FILE" ]]; then
        local tail_content
        tail_content=$(tail -n "$lines" "$LOG_FILE" 2>/dev/null) || true
        if [[ -n "$tail_content" ]]; then
            echo ""
            echo -e "${GRAY}--- Ultimi log app ($LOG_FILE) ---${RESET}"
            while IFS= read -r row; do
                echo -e "${GRAY}  $row${RESET}"
            done <<< "$tail_content"
            shown=true
        fi
    fi

    if [[ -f "$ERR_LOG_FILE" ]]; then
        local err_tail
        err_tail=$(tail -n "$lines" "$ERR_LOG_FILE" 2>/dev/null) || true
        if [[ -n "$err_tail" ]]; then
            echo ""
            echo -e "${GRAY}--- Ultimi errori ($ERR_LOG_FILE) ---${RESET}"
            while IFS= read -r row; do
                echo -e "${RED}  $row${RESET}"
            done <<< "$err_tail"
            shown=true
        fi
    fi

    if [[ "$shown" == false ]]; then
        echo -e "${GRAY}  (nessun log disponibile; l'app potrebbe non aver mai avuto avvio)${RESET}"
    fi
}

# =============================================================================
# Utility - avvio processo persistente
# =============================================================================

start_persistent_process() {
    local executable="$1"
    local work_dir="$2"
    local log_path="$3"
    local err_log_path="$4"
    shift 4
    # Argomenti rimanenti passati come array — niente word splitting
    (
        cd "$work_dir"
        nohup "$executable" "$@" >> "$log_path" 2>> "$err_log_path" &
        echo $!
    )
}

# =============================================================================
# Utility - PID file
# =============================================================================

write_pid_file() {
    local pid="$1"
    local port="$2"
    local start_time
    start_time=$(date "+%Y-%m-%d %H:%M:%S")
    cat > "$PID_FILE" <<EOF
{
  "Pid": $pid,
  "Port": "$port",
  "StartTime": "$start_time"
}
EOF
}

read_pid_from_file()       { grep '"Pid"'       "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/'; }
read_port_from_file()      { grep '"Port"'      "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'; }
read_start_time_from_file(){ grep '"StartTime"' "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'; }

# =============================================================================
# Icone
# =============================================================================

find_icon() {
    local candidates=(
        "$TARGET_DIR/public/favicon-64.png"
        "$TARGET_DIR/public/favicon.png"
        "$TARGET_DIR/public/favicon.ico"
    )
    for f in "${candidates[@]}"; do
        [[ -f "$f" ]] && echo "$f" && return
    done
}

# =============================================================================
# Collegamento desktop
# =============================================================================

install_shortcuts() {
    local desktop_path="$HOME/Desktop"
    if [[ ! -d "$desktop_path" ]] && command -v xdg-user-dir >/dev/null 2>&1; then
        desktop_path="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
    fi

    if [[ ! -d "$desktop_path" ]]; then
        echo -e "${GRAY}  Cartella Desktop non trovata, salto.${RESET}"
        return
    fi

    local icon_path
    icon_path=$(find_icon)

    if [[ "$(uname)" == "Darwin" ]]; then
        local shortcut="$desktop_path/Audio_AI_Assistance.command"
        cat > "$shortcut" <<EOF
#!/usr/bin/env bash
cd "$(printf '%s' "$TARGET_DIR" | sed 's/"/\\"/g')"
bash "$(printf '%s' "$SELF_PATH" | sed 's/"/\\"/g')" start
# Leggi la porta dal file di stato (fallback 8090)
_pid_file="$(printf '%s' "$TARGET_DIR" | sed 's/"/\\"/g')/.app_service.json"
if [[ -f "\$_pid_file" ]]; then
    _port=\$(grep '"Port"' "\$_pid_file" 2>/dev/null | sed 's/.*:.*"\([^"]*\)".*/\1/')
fi
_port="\${_port:-8090}"
_url="http://127.0.0.1:\$_port"
echo ""
echo "Apertura browser su \$_url ..."
open "\$_url"
echo ""
read -rn 1 -p "Premi un tasto per chiudere questa finestra..."
osascript -e 'tell application "Terminal" to close front window' 2>/dev/null || true
EOF
        chmod +x "$shortcut"

        if [[ -n "$icon_path" ]]; then
            # fileicon (brew) è il metodo più affidabile su macOS moderno
            if command -v fileicon >/dev/null 2>&1; then
                fileicon set "$shortcut" "$icon_path" 2>/dev/null || true
            else
                osascript - "$icon_path" "$shortcut" <<'APPLESCRIPT' 2>/dev/null || true
on run {iconPath, targetPath}
    set iconAlias to POSIX file iconPath as alias
    set targetAlias to POSIX file targetPath as alias
    tell application "Finder"
        set icon of targetAlias to icon of iconAlias
    end tell
end run
APPLESCRIPT
            fi
        fi

        echo -e "${GREEN}  Collegamento creato sul Desktop: $shortcut${RESET}"
    else
        local shortcut="$desktop_path/Audio_AI_Assistance.desktop"
        local icon_entry="audio-input-microphone"
        [[ -n "$icon_path" ]] && icon_entry="$icon_path"

        cat > "$shortcut" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Audio AI Assistance
Comment=Avvia Audio AI Assistant
Exec=bash -c 'cd "$(printf '%s' "$TARGET_DIR" | sed "s/'/'\\\\''/g")" && bash "$(printf '%s' "$SELF_PATH" | sed "s/'/'\\\\''/g")" start; exec bash'
Icon=$icon_entry
Terminal=true
Categories=Utility;
EOF
        chmod +x "$shortcut"
        echo -e "${GREEN}  Collegamento creato sul Desktop: $shortcut${RESET}"
    fi
}

shortcut_exists() {
    if [[ "$(uname)" == "Darwin" ]]; then
        [[ -f "$HOME/Desktop/Audio_AI_Assistance.command" ]]
    else
        [[ -f "$HOME/Desktop/Audio_AI_Assistance.desktop" ]]
    fi
}

remove_shortcut() {
    if [[ "$(uname)" == "Darwin" ]]; then
        rm -f "$HOME/Desktop/Audio_AI_Assistance.command"
    else
        rm -f "$HOME/Desktop/Audio_AI_Assistance.desktop"
    fi
}

# =============================================================================
# Autostart al boot
# =============================================================================

autostart_enable() {
    if [[ "$(uname)" == "Darwin" ]]; then
        _autostart_enable_macos
    else
        _autostart_enable_linux
    fi
}

autostart_disable() {
    if [[ "$(uname)" == "Darwin" ]]; then
        _autostart_disable_macos
    else
        _autostart_disable_linux
    fi
}

autostart_is_enabled() {
    if [[ "$(uname)" == "Darwin" ]]; then
        [[ -f "$LAUNCHAGENT_PLIST" ]]
    else
        [[ -f "$SYSTEMD_SERVICE" || -f "$AUTOSTART_DESKTOP" ]]
    fi
}

_autostart_enable_macos() {
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$LAUNCHAGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHAGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${SELF_PATH}</string>
        <string>start</string>
        <string>--port</string>
        <string>${PORT}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${ERR_LOG_FILE}</string>
    <key>WorkingDirectory</key>
    <string>${TARGET_DIR}</string>
</dict>
</plist>
EOF
    launchctl load "$LAUNCHAGENT_PLIST" 2>/dev/null || true
    echo -e "${GREEN}  Autostart abilitato (LaunchAgent): $LAUNCHAGENT_PLIST${RESET}"
}

_autostart_disable_macos() {
    if [[ -f "$LAUNCHAGENT_PLIST" ]]; then
        launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null || true
        rm -f "$LAUNCHAGENT_PLIST"
        echo -e "${GREEN}  Autostart disabilitato.${RESET}"
    else
        echo -e "${GRAY}  Autostart non era abilitato.${RESET}"
    fi
}

_autostart_enable_linux() {
    if command -v systemctl >/dev/null 2>&1 && systemctl --user status >/dev/null 2>&1; then
        mkdir -p "$(dirname "$SYSTEMD_SERVICE")"
        cat > "$SYSTEMD_SERVICE" <<EOF
[Unit]
Description=Audio AI Assistant
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash "${SELF_PATH}" start --port ${PORT}
WorkingDirectory=${TARGET_DIR}
Restart=no
StandardOutput=append:${LOG_FILE}
StandardError=append:${ERR_LOG_FILE}

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        systemctl --user enable audio-ai-assistant.service 2>/dev/null || true
        echo -e "${GREEN}  Autostart abilitato (systemd user): $SYSTEMD_SERVICE${RESET}"
    else
        # Fallback: XDG autostart
        mkdir -p "$(dirname "$AUTOSTART_DESKTOP")"
        local icon_path; icon_path=$(find_icon)
        cat > "$AUTOSTART_DESKTOP" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Audio AI Assistance (autostart)
Exec=/bin/bash "${SELF_PATH}" start --port ${PORT}
Icon=${icon_path:-audio-input-microphone}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
        echo -e "${GREEN}  Autostart abilitato (XDG autostart): $AUTOSTART_DESKTOP${RESET}"
    fi
}

_autostart_disable_linux() {
    local removed=false
    if [[ -f "$SYSTEMD_SERVICE" ]]; then
        systemctl --user disable audio-ai-assistant.service 2>/dev/null || true
        rm -f "$SYSTEMD_SERVICE"
        systemctl --user daemon-reload 2>/dev/null || true
        removed=true
    fi
    if [[ -f "$AUTOSTART_DESKTOP" ]]; then
        rm -f "$AUTOSTART_DESKTOP"
        removed=true
    fi
    if [[ "$removed" == true ]]; then
        echo -e "${GREEN}  Autostart disabilitato.${RESET}"
    else
        echo -e "${GRAY}  Autostart non era abilitato.${RESET}"
    fi
}

# =============================================================================
# Start
# =============================================================================

start_app_service() {
    if test_port_listening "$PORT"; then
        echo -e "${YELLOW}Il servizio è già in ascolto sulla porta $PORT.${RESET}"
        echo -e "${YELLOW}Usa 'stop' prima di avviarlo di nuovo, oppure 'restart'.${RESET}"
        return 0
    fi
    [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"

    local npm_cmd="npm"

    echo ""
    local node_modules_path="$TARGET_DIR/node_modules"
    if [[ ! -d "$node_modules_path" ]]; then
        echo -e "${CYAN}[1/3] Installazione dipendenze npm...${RESET}"
        (cd "$TARGET_DIR" && "$npm_cmd" install)
        echo -e "${GREEN}      Dipendenze installate.${RESET}"
    else
        echo -e "${GREEN}[1/3] Dipendenze presenti, salto.${RESET}"
    fi

    echo ""
    echo -e "${CYAN}[2/3] Avvio server React (localhost:$PORT)...${RESET}"
    [[ -f "$LOG_FILE" ]]     && rm -f "$LOG_FILE"
    [[ -f "$ERR_LOG_FILE" ]] && rm -f "$ERR_LOG_FILE"

    local npm_pid
    npm_pid=$(start_persistent_process "$npm_cmd" \
                  "$TARGET_DIR" "$LOG_FILE" "$ERR_LOG_FILE" \
                  run dev -- --port "$PORT" --host 127.0.0.1)

    echo ""
    echo -e "${CYAN}[3/3] Verifica disponibilità...${RESET}"
    local app_url="http://127.0.0.1:$PORT"

    write_pid_file "$npm_pid" "$PORT"

    if wait_app_ready_verbose "$app_url" "$LOG_FILE" 60; then
        echo -e "${GREEN}Servizio avviato con successo!${RESET}"
    fi
}

# =============================================================================
# Stop
# =============================================================================

stop_app_service() {
    local stopped=false

    if [[ -f "$PID_FILE" ]]; then
        local saved_pid saved_port
        saved_pid=$(read_pid_from_file)
        saved_port=$(read_port_from_file)
        echo -e "${CYAN}Arresto servizio (porta $saved_port)...${RESET}"
        [[ -n "$saved_pid" ]] && kill_process_tree "$saved_pid"
        kill_process_by_port "$saved_port"
        rm -f "$PID_FILE"
        stopped=true
    fi

    if test_port_listening "$PORT"; then
        echo -e "${YELLOW}Porta $PORT ancora occupata, forzo la chiusura...${RESET}"
        kill_process_by_port "$PORT"
        stopped=true
    fi

    if [[ "$stopped" == true ]]; then
        echo -e "${GREEN}Servizio arrestato.${RESET}"
    else
        echo -e "${GRAY}Nessun servizio in esecuzione trovato.${RESET}"
    fi
}

# =============================================================================
# Status
# =============================================================================

check_app_status() {
    local port_up=false http_ok=false

    if test_port_listening "$PORT"; then port_up=true; fi

    if [[ "$port_up" == true ]]; then
        if curl -sf --max-time 3 "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
            http_ok=true
        fi
    fi

    if [[ "$port_up" == true || "$http_ok" == true ]]; then
        echo ""
        echo -e "${CYAN}=== Stato Servizio Audio AI ===${RESET}"
        echo -e "Stato:   ${GREEN}IN ESECUZIONE${RESET}"
        echo "Porta:   $PORT"
        echo "Accesso: http://127.0.0.1:$PORT"
        if [[ "$http_ok" == true ]]; then
            echo -e "HTTP:    ${GREEN}risponde (200 OK)${RESET}"
        else
            echo -e "HTTP:    ${YELLOW}porta aperta, pagina non verificata${RESET}"
        fi
        if [[ -f "$PID_FILE" ]]; then
            local start_time
            start_time=$(read_start_time_from_file)
            [[ -n "$start_time" ]] && echo "Avviato: $start_time"
        fi
        if autostart_is_enabled; then
            echo -e "Autostart: ${GREEN}abilitato${RESET}"
        else
            echo -e "Autostart: ${GRAY}disabilitato${RESET}"
        fi
    else
        echo -e "Stato: ${RED}NON IN ESECUZIONE${RESET}"
        show_service_logs 25
    fi
}

# =============================================================================
# Restart
# =============================================================================

restart_app_service() {
    echo -e "${CYAN}=== Riavvio servizio ===${RESET}"
    stop_app_service
    sleep 1
    start_app_service
}

# =============================================================================
# Install
# =============================================================================

install_app() {
    echo -e "${CYAN}=== Installazione Audio AI Assistant ===${RESET}"

    local node_modules_path="$TARGET_DIR/node_modules"
    local reinstall_modules=false

    if [[ -d "$node_modules_path" ]]; then
        echo ""
        echo -e "${YELLOW}node_modules/ già presente.${RESET}"
        printf "  Reinstallare le dipendenze npm? [y/N] "
        read -r answer </dev/tty
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            reinstall_modules=true
        fi
    fi

    if [[ "$reinstall_modules" == true ]]; then
        stop_app_service
        echo -e "${YELLOW}Eliminazione node_modules...${RESET}"
        rm -rf "$node_modules_path"
        if [[ -d "$node_modules_path" ]]; then
            echo -e "${RED}Alcuni file sono bloccati. Chiudi editor e terminali, poi riprova.${RESET}"
            return 1
        fi
        local lock_file="$TARGET_DIR/package-lock.json"
        [[ -f "$lock_file" ]] && rm -f "$lock_file"
        echo -e "${GREEN}Cartella pulita.${RESET}"
    fi

    echo ""
    echo -e "${CYAN}[1/3] Collegamento Desktop...${RESET}"
    if shortcut_exists; then
        echo -e "${GREEN}      Collegamento già presente, sovrascrivo con icona aggiornata.${RESET}"
    fi
    install_shortcuts

    echo ""
    if ! autostart_is_enabled; then
        printf "  Abilitare l'avvio automatico all'accensione/login del Mac? [y/N] "
        read -r answer </dev/tty
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            echo -e "${CYAN}[2/3] Configurazione autostart...${RESET}"
            autostart_enable
        else
            echo -e "${GRAY}[2/3] Autostart saltato.${RESET}"
        fi
    else
        echo -e "${GREEN}[2/3] Autostart già abilitato.${RESET}"
    fi

    echo ""
    echo -e "${CYAN}[3/3] Avvio app...${RESET}"
    start_app_service
}

# =============================================================================
# Uninstall
# =============================================================================

uninstall_app() {
    echo -e "${CYAN}=== Disinstallazione Audio AI Assistant ===${RESET}"
    echo -e "${YELLOW}Saranno rimossi: collegamento desktop, autostart, node_modules, dist/, log, .app_service.json${RESET}"
    echo -e "${YELLOW}NON saranno rimossi: sorgenti (src/, public/), .env, package.json, setup_and_run.sh${RESET}"
    echo ""
    printf "  Confermi la disinstallazione? [y/N] "
    read -r answer </dev/tty
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
        echo -e "${GRAY}Operazione annullata.${RESET}"
        return 0
    fi

    stop_app_service

    if autostart_is_enabled; then
        echo -e "${CYAN}Rimozione autostart...${RESET}"
        autostart_disable
    fi

    if shortcut_exists; then
        echo -e "${CYAN}Rimozione collegamento desktop...${RESET}"
        remove_shortcut
        echo -e "${GREEN}  Collegamento rimosso.${RESET}"
    fi

    local items_to_remove=(
        "$TARGET_DIR/node_modules"
        "$TARGET_DIR/dist"
        "$TARGET_DIR/package-lock.json"
        "$LOG_FILE"
        "$ERR_LOG_FILE"
        "$PID_FILE"
    )

    for item in "${items_to_remove[@]}"; do
        if [[ -e "$item" ]]; then
            echo -e "${CYAN}Rimozione: $item${RESET}"
            rm -rf "$item"
        fi
    done

    echo ""
    echo -e "${GREEN}Disinstallazione completata.${RESET}"
    echo -e "${GRAY}Per reinstallare: ./setup_and_run.sh install${RESET}"
}

# =============================================================================
# Main
# =============================================================================

case "$ACTION" in
    start)            start_app_service ;;
    stop)             stop_app_service ;;
    status)           check_app_status ;;
    restart)          restart_app_service ;;
    install)          install_app ;;
    uninstall)        uninstall_app ;;
    autostart-enable) autostart_enable ;;
    autostart-disable)autostart_disable ;;
    help|*)           show_help ;;
esac
