#!/bin/bash

# Script generico per caricare modifiche su GitHub.
# Salva URL e token in ~/.github_push_config (mai committato).

set -euo pipefail

CONFIG_FILE="$HOME/.github_push_config"

echo "📦 Verifica repository Git..."

# ── Config persistente ─────────────────────────────────────────────────────────
load_config() {
    SAVED_REPO_URL=""
    SAVED_TOKEN=""
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
}

save_config() {
    cat > "$CONFIG_FILE" <<EOF
SAVED_REPO_URL="$1"
SAVED_TOKEN="$2"
EOF
    chmod 600 "$CONFIG_FILE"
    echo "💾 URL e token salvati in $CONFIG_FILE"
}

# ── Helpers URL ────────────────────────────────────────────────────────────────
strip_token() {
    # Rimuove il token dall'URL: https://TOKEN@github.com/... → https://github.com/...
    echo "$1" | sed -E 's|https://[^@]+@(github\.com)|\https://\1|'
}

build_auth_url() {
    local clean_url="$1"
    local token="$2"
    local repo_path
    repo_path=$(echo "$clean_url" | sed -E 's|https://([^@]+@)?github\.com/||')
    echo "https://${token}@github.com/${repo_path}"
}

# ── Richiesta interattiva token ────────────────────────────────────────────────
ask_token() {
    local clean_url="$1"
    echo "---------------------------------------------------------" >&2
    echo "🔑 GitHub richiede un Personal Access Token (PAT)." >&2
    echo "   Generalo su: https://github.com/settings/tokens (Permesso: 'repo')" >&2
    read -s -p "   Incolla il tuo Token PAT: " NEW_TOKEN </dev/tty
    echo "" >&2
    if [ -z "$NEW_TOKEN" ]; then
        echo "❌ Nessun token inserito. Operazione annullata." >&2
        exit 1
    fi
    SAVED_TOKEN="$NEW_TOKEN"
    save_config "$clean_url" "$NEW_TOKEN"
    build_auth_url "$clean_url" "$NEW_TOKEN"
}

load_config

# ── 1. Init repo locale se non esiste ─────────────────────────────────────────
if [ ! -d ".git" ]; then
    echo "⚠️  Repository non inizializzato. Procedo con 'git init'..."
    git init

    CLEAN_URL="$SAVED_REPO_URL"
    if [ -z "$CLEAN_URL" ]; then
        read -p "🔗 Inserisci l'URL del repository GitHub (es. https://github.com/user/repo.git): " CLEAN_URL
        [ -z "$CLEAN_URL" ] && { echo "❌ URL non inserito."; exit 1; }
    else
        echo "🔗 URL caricato dalla configurazione: $CLEAN_URL"
    fi

    if [ -n "$SAVED_TOKEN" ]; then
        echo "🔑 Token caricato dalla configurazione salvata."
        AUTH_URL=$(build_auth_url "$CLEAN_URL" "$SAVED_TOKEN")
        save_config "$CLEAN_URL" "$SAVED_TOKEN"
    else
        AUTH_URL=$(ask_token "$CLEAN_URL")
    fi

    git remote add origin "$AUTH_URL"
    git fetch origin
    REMOTE_DEFAULT=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //' || echo "main")
    git checkout -b "${REMOTE_DEFAULT:-main}"
    git reset --mixed "origin/${REMOTE_DEFAULT:-main}" 2>/dev/null || true
fi

# ── 2. Recupero/validazione remote ────────────────────────────────────────────
REPO_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$REPO_URL" ]; then
    CLEAN_URL="$SAVED_REPO_URL"
    if [ -z "$CLEAN_URL" ]; then
        read -p "🔗 Nessun remote 'origin'. Inserisci l'URL del repository GitHub: " CLEAN_URL
        [ -z "$CLEAN_URL" ] && { echo "❌ URL non inserito."; exit 1; }
    else
        echo "🔗 URL caricato dalla configurazione: $CLEAN_URL"
    fi

    if [ -n "$SAVED_TOKEN" ]; then
        echo "🔑 Token caricato dalla configurazione salvata."
        AUTH_URL=$(build_auth_url "$CLEAN_URL" "$SAVED_TOKEN")
    else
        AUTH_URL=$(ask_token "$CLEAN_URL")
    fi

    git remote add origin "$AUTH_URL"
    REPO_URL="$AUTH_URL"
fi

# Assicura che il token sia nell'URL del remote
CLEAN_URL=$(strip_token "$REPO_URL")
if [[ "$REPO_URL" != *"@"* ]]; then
    # URL senza token: prova a usare quello salvato
    if [ -n "$SAVED_TOKEN" ]; then
        echo "🔑 Token caricato dalla configurazione salvata."
        REPO_URL=$(build_auth_url "$CLEAN_URL" "$SAVED_TOKEN")
    else
        REPO_URL=$(ask_token "$CLEAN_URL")
    fi
    git remote set-url origin "$REPO_URL"
fi

# ── 3. Allineamento branch ─────────────────────────────────────────────────────
LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
REMOTE_DEFAULT=$(env GIT_TERMINAL_PROMPT=0 git remote show origin 2>/dev/null \
    | grep 'HEAD branch' | sed 's/.*: //' || echo "main")

if [ "$LOCAL_BRANCH" != "$REMOTE_DEFAULT" ]; then
    echo "🔀 Branch '$LOCAL_BRANCH' → '$REMOTE_DEFAULT'..."
    git branch -m "$LOCAL_BRANCH" "$REMOTE_DEFAULT"
    LOCAL_BRANCH="$REMOTE_DEFAULT"
fi

BRANCH="$LOCAL_BRANCH"

# ── 4. Commit ──────────────────────────────────────────────────────────────────
read -p "📝 Messaggio commit (INVIO = 'Aggiornamento'): " COMMIT_MSG
COMMIT_MSG="${COMMIT_MSG:-Aggiornamento}"

echo "⏳ Aggiungo le modifiche..."
git add .
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "ℹ️  Nessuna modifica da committare. Controllo push pendenti..."

# ── 5. Pull + rebase ───────────────────────────────────────────────────────────
echo "🔄 Allineamento con il remote (pull --rebase)..."
if ! env GIT_TERMINAL_PROMPT=0 git pull origin "$BRANCH" --rebase 2>&1; then
    echo ""
    echo "⚠️  Conflitti rilevati durante il rebase. Risolvili manualmente:"
    echo "    1. Controlla i file in conflitto:  git status"
    echo "    2. Risolvi i conflitti nei file"
    echo "    3. Segna come risolti:             git add <file>"
    echo "    4. Continua il rebase:             git rebase --continue"
    echo "    5. Poi riesegui:                   ./github_push.sh"
    exit 1
fi

# ── 6. Push ────────────────────────────────────────────────────────────────────
echo "🚀 Push su '$BRANCH'..."
if env GIT_TERMINAL_PROMPT=0 git push origin "$BRANCH"; then
    echo "---------------------------------------------------------"
    echo "✅ Push completato con successo! Tutto allineato su GitHub."
    exit 0
fi

# Push fallito → probabile token scaduto
echo ""
echo "⚠️  Push fallito. Il token potrebbe essere scaduto o non valido."
NEW_AUTH_URL=$(ask_token "$CLEAN_URL")
git remote set-url origin "$NEW_AUTH_URL"

echo "🚀 Riprovo il push con il nuovo token..."
if env GIT_TERMINAL_PROMPT=0 git push origin "$BRANCH"; then
    echo "✅ Push completato con successo! Nuovo token salvato."
else
    echo "❌ Errore push. Verifica che il token sia valido e abbia il permesso 'repo'."
    exit 1
fi
