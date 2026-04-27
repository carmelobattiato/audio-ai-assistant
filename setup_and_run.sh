#!/usr/bin/env bash
# =============================================================================
# Audio AI Assistant - Script di Gestione (Linux/macOS)
# SYNOPSIS:
#   ./setup_and_run.sh [azione] [-p|--port porta]
# EXAMPLES:
#   ./setup_and_run.sh start
#   ./setup_and_run.sh stop
#   ./setup_and_run.sh status
#   ./setup_and_run.sh restart
#   ./setup_and_run.sh reinstall
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.app_service.json"
LOG_FILE="$SCRIPT_DIR/app_service.log"
ERR_LOG_FILE="$SCRIPT_DIR/app_service_error.log"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
RESET='\033[0m'

# --- Arguments ---
ACTION="${1:-help}"
PORT="8090"

if [[ $# -ge 1 ]]; then shift; fi
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)
            PORT="${2:-8090}"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

case "$ACTION" in
    start|stop|status|restart|reinstall|help) ;;
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
    echo "  start     - Avvia l'app in background e verifica che risponda."
    echo "  stop      - Ferma il servizio e libera la porta."
    echo "  status    - Mostra lo stato; se offline mostra i log recenti."
    echo "  restart   - Esegue stop + start in sequenza."
    echo "  reinstall - Elimina node_modules e riavvia l'installazione."
    echo "  help      - Mostra questo messaggio (default)."
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
# Utility - verifica HTTP con polling
# =============================================================================

wait_app_ready() {
    local url="$1"
    local max_seconds="${2:-40}"
    printf "   Attendo risposta su %s " "$url"
    local deadline=$((SECONDS + max_seconds))
    while [[ $SECONDS -lt $deadline ]]; do
        if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}[OK]${RESET}"
            return 0
        fi
        printf "."
        sleep 1
    done
    echo -e " ${YELLOW}[TIMEOUT]${RESET}"
    return 1
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
# Lancia il comando in background con nohup, immune a SIGHUP (chiusura terminale).
# Restituisce il PID del processo figlio via stdout.
# =============================================================================

start_persistent_process() {
    local executable="$1"
    local arguments="$2"
    local work_dir="$3"
    local log_path="$4"
    local err_log_path="$5"
    (
        cd "$work_dir"
        # shellcheck disable=SC2086
        nohup $executable $arguments >> "$log_path" 2>> "$err_log_path" &
        echo $!
    )
}

# =============================================================================
# Utility - PID file (JSON senza dipendenze esterne)
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

read_pid_from_file() {
    grep '"Pid"' "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*\([0-9]*\).*/\1/'
}

read_port_from_file() {
    grep '"Port"' "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'
}

read_start_time_from_file() {
    grep '"StartTime"' "$PID_FILE" 2>/dev/null | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'
}

# =============================================================================
# Shortcut desktop
# macOS  → file .command eseguibile sul Desktop
# Linux  → file .desktop (standard freedesktop)
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

    if [[ "$(uname)" == "Darwin" ]]; then
        local shortcut="$desktop_path/Audio_AI_Assistance.command"
        cat > "$shortcut" <<EOF
#!/usr/bin/env bash
cd "$SCRIPT_DIR"
bash setup_and_run.sh start
EOF
        chmod +x "$shortcut"
        echo -e "${GREEN}  Collegamento creato sul Desktop: $shortcut${RESET}"
    else
        local shortcut="$desktop_path/Audio_AI_Assistance.desktop"
        cat > "$shortcut" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Audio AI Assistance
Comment=Avvia Audio AI Assistant
Exec=bash -c 'cd "$SCRIPT_DIR" && bash setup_and_run.sh start; exec bash'
Icon=audio-input-microphone
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

    # [1/4] Dipendenze npm
    echo ""
    local node_modules_path="$SCRIPT_DIR/node_modules"
    if [[ ! -d "$node_modules_path" ]]; then
        echo -e "${CYAN}[1/4] Installazione dipendenze npm...${RESET}"
        (cd "$SCRIPT_DIR" && $npm_cmd install)
        echo -e "${GREEN}      Dipendenze installate.${RESET}"
    else
        echo -e "${GREEN}[1/4] Dipendenze presenti, salto.${RESET}"
    fi

    # [2/4] Collegamento desktop
    if shortcut_exists; then
        echo -e "${GREEN}[2/4] Collegamento già installato, salto.${RESET}"
    else
        echo -e "${CYAN}[2/4] Installazione collegamento desktop...${RESET}"
        install_shortcuts
    fi

    # [3/4] Avvio npm dev server
    echo ""
    echo -e "${CYAN}[3/4] Avvio server React (localhost:$PORT)...${RESET}"
    [[ -f "$LOG_FILE" ]]     && rm -f "$LOG_FILE"
    [[ -f "$ERR_LOG_FILE" ]] && rm -f "$ERR_LOG_FILE"

    local npm_args="run dev -- --port $PORT --host 127.0.0.1"
    local npm_pid
    npm_pid=$(start_persistent_process "$npm_cmd" "$npm_args" \
                  "$SCRIPT_DIR" "$LOG_FILE" "$ERR_LOG_FILE")

    # [4/4] Verifica che l'app risponda via HTTP
    echo ""
    echo -e "${CYAN}[4/4] Verifica disponibilità...${RESET}"
    local app_url="http://127.0.0.1:$PORT"
    local is_ready=false
    if wait_app_ready "$app_url" 40; then
        is_ready=true
    fi

    write_pid_file "$npm_pid" "$PORT"

    echo ""
    if [[ "$is_ready" == true ]]; then
        echo -e "${GREEN}Servizio avviato con successo!${RESET}"
        echo -e "${GREEN}Accesso: $app_url${RESET}"
    else
        echo -e "${YELLOW}Servizio avviato ma l'app non risponde ancora.${RESET}"
        echo -e "${YELLOW}Potrebbe essere ancora in compilazione. Log:${RESET}"
        show_service_logs 15
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

    # Fallback: forza chiusura se la porta è ancora occupata
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

    if test_port_listening "$PORT"; then
        port_up=true
    fi

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
# Reinstall
# =============================================================================

reinstall_app() {
    echo -e "${CYAN}=== Reinstallazione Pulita ===${RESET}"
    stop_app_service

    local node_modules_path="$SCRIPT_DIR/node_modules"
    if [[ -d "$node_modules_path" ]]; then
        echo -e "${YELLOW}Eliminazione node_modules...${RESET}"
        rm -rf "$node_modules_path"
        if [[ -d "$node_modules_path" ]]; then
            echo -e "${RED}Alcuni file sono bloccati. Chiudi editor e terminali, poi riprova.${RESET}"
            return 1
        fi
    fi

    local lock_file="$SCRIPT_DIR/package-lock.json"
    [[ -f "$lock_file" ]] && rm -f "$lock_file"

    echo -e "${GREEN}Cartella pulita. Avvio installazione...${RESET}"
    start_app_service
}

# =============================================================================
# Main
# =============================================================================

case "$ACTION" in
    start)     start_app_service ;;
    stop)      stop_app_service ;;
    status)    check_app_status ;;
    restart)   restart_app_service ;;
    reinstall) reinstall_app ;;
    help|*)    show_help ;;
esac
