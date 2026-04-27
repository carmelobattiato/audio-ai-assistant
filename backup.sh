#!/bin/bash

# Script per creare un backup dell'intera directory di lavoro.
# I backup vengono salvati in ../Backup/ con nome <app>_YYYYMMDD_HHMMSS.tar.gz

# --- Percorsi base ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SLUG=$(basename "$SCRIPT_DIR")
BACKUP_DIR="$SCRIPT_DIR/../Backup"

# --- Crea la cartella Backup un livello sopra se non esiste ---
mkdir -p "$BACKUP_DIR"

# --- Timestamp e nomi file ---
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${APP_SLUG}_${TIMESTAMP}.tar.gz"
BACKUP_FILE_ERR="$BACKUP_DIR/${APP_SLUG}_${TIMESTAMP}_ERR.tar.gz"
TAR_LOG=$(mktemp)

echo "Applicazione : $APP_SLUG"
echo "Destinazione : $BACKUP_DIR"
echo "Inizio backup: $BACKUP_FILE"

# --- Funzione conversione dimensioni leggibili ---
human_size() {
    local bytes=$1
    if   [ "$bytes" -ge $((1024*1024*1024)) ]; then
        printf "%.2f GB" "$(echo "scale=2; $bytes/1073741824" | bc)"
    elif [ "$bytes" -ge $((1024*1024)) ]; then
        printf "%.2f MB" "$(echo "scale=2; $bytes/1048576" | bc)"
    elif [ "$bytes" -ge 1024 ]; then
        printf "%.2f KB" "$(echo "scale=2; $bytes/1024" | bc)"
    else
        printf "%d B" "$bytes"
    fi
}

# --- Esclusioni comuni ---
EXCLUDES=(
    --exclude='./node_modules'
    --exclude='./.git'
    --exclude='./.claude'
    --exclude='./.app_service.json'
    --exclude='./app_service.log'
    --exclude='./app_service_error.log'
)

cd "$SCRIPT_DIR"

# --- Calcolo dimensione originale ---
ORIGINAL_SIZE=$(tar -cf - "${EXCLUDES[@]}" . 2>/dev/null | wc -c)

# --- Compressione ---
tar -czf "$BACKUP_FILE" "${EXCLUDES[@]}" . 2>"$TAR_LOG"
TAR_EXIT=$?

if [ $TAR_EXIT -eq 0 ]; then
    COMPRESSED_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
    LIST=$(tar -tf "$BACKUP_FILE")
    FILE_COUNT=$(echo "$LIST" | grep -v "/$" | wc -l)
    DIR_COUNT=$(echo "$LIST" | grep "/$" | grep -v "^\./$" | wc -l)
    RATIO=$(echo "scale=1; (($ORIGINAL_SIZE - $COMPRESSED_SIZE) * 100) / $ORIGINAL_SIZE" | bc)

    echo ""
    echo "📦 File compressi    : $FILE_COUNT file in $DIR_COUNT cartelle"
    echo "📂 Dimensione orig   : $(human_size "$ORIGINAL_SIZE")"
    echo "🗜  Dimensione gz     : $(human_size "$COMPRESSED_SIZE")"
    echo "📉 Compressione      : ${RATIO}%"

    # Mantiene solo gli ultimi 20 backup OK per questa app (non conta gli _ERR)
    BACKUPS_TO_KEEP=20
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR/${APP_SLUG}_"*.tar.gz 2>/dev/null | grep -v '_ERR' | wc -l)
    DELETED_COUNT=0
    if [ "$BACKUP_COUNT" -gt "$BACKUPS_TO_KEEP" ]; then
        DELETED_COUNT=$((BACKUP_COUNT - BACKUPS_TO_KEEP))
        ls -1t "$BACKUP_DIR/${APP_SLUG}_"*.tar.gz | grep -v '_ERR' | tail -n "$DELETED_COUNT" | xargs rm -f
    fi

    echo "🗑️  Vecchi backup eliminati: $DELETED_COUNT"
    echo ""
    echo "✅ Backup completato con successo: $BACKUP_FILE"
    rm -f "$TAR_LOG"
else
    echo ""
    echo "❌ Errore durante la creazione del backup (exit code: $TAR_EXIT)"
    echo ""

    if [ -s "$TAR_LOG" ]; then
        echo "📋 Dettaglio errori tar:"
        cat "$TAR_LOG" | sed 's/^/   /'
    fi

    if [ -f "$BACKUP_FILE" ]; then
        PARTIAL_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
        mv "$BACKUP_FILE" "$BACKUP_FILE_ERR"
        echo ""
        echo "⚠️  File parziale salvato come: $BACKUP_FILE_ERR"
        echo "   Dimensione parziale: $(human_size "$PARTIAL_SIZE")"
    else
        echo "⚠️  Nessun file parziale generato."
    fi

    echo ""
    echo "🔍 Info debug:"
    echo "   Spazio disco disponibile: $(df -h . | awk 'NR==2{print $4}') liberi su $(df -h . | awk 'NR==2{print $2}')"
    echo "   Directory corrente: $(pwd)"
    echo "   Permessi Backup/: $(ls -ld "$BACKUP_DIR/")"

    rm -f "$TAR_LOG"
    exit 1
fi
