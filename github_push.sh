#!/bin/bash

# Script generico per caricare modifiche su GitHub.
# Funziona in qualsiasi progetto: rileva automaticamente il remote origin
# oppure chiede di configurarlo al primo utilizzo.

set -euo pipefail

echo "📦 Verifica e allineamento repository Git..."

# Funzione: chiede il PAT e riscrive l'URL con il token incorporato.
# I messaggi vanno su stderr, solo l'URL autenticato va su stdout
# (così la command substitution $(...) cattura solo l'URL).
request_token() {
    local url="$1"
    echo "---------------------------------------------------------" >&2
    echo "🔑 GitHub richiede un Personal Access Token (PAT)." >&2
    echo "   Generalo su: https://github.com/settings/tokens (Permesso: 'repo')" >&2
    read -s -p "   Incolla il tuo Token PAT: " GITHUB_TOKEN </dev/tty
    echo "" >&2
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "❌ Nessun token inserito. Operazione annullata." >&2
        exit 1
    fi
    local repo_path
    repo_path=$(echo "$url" | sed -E 's|https://([^@]+@)?github\.com/||')
    echo "https://${GITHUB_TOKEN}@github.com/${repo_path}"
}

# 1. Inizializzazione se non esiste la repo locale
if [ ! -d ".git" ]; then
    echo "⚠️ Repository non inizializzato localmente. Procedo con 'git init'..."
    git init

    read -p "🔗 Inserisci l'URL del repository GitHub (es. https://github.com/user/repo.git): " REPO_URL
    if [ -z "$REPO_URL" ]; then
        echo "❌ URL non inserito. Operazione annullata."
        exit 1
    fi

    # Chiedi subito il token così tutti i comandi di rete usano l'URL autenticato
    REPO_URL=$(request_token "$REPO_URL")

    git remote add origin "$REPO_URL"
    git fetch origin
    git checkout -b main
    git reset --mixed origin/main 2>/dev/null || true
fi

# 2. Recupero URL dal remote esistente
REPO_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$REPO_URL" ]; then
    read -p "🔗 Nessun remote 'origin' trovato. Inserisci l'URL del repository GitHub: " REPO_URL
    if [ -z "$REPO_URL" ]; then
        echo "❌ URL non inserito. Operazione annullata."
        exit 1
    fi
    REPO_URL=$(request_token "$REPO_URL")
    git remote add origin "$REPO_URL"
fi

# Estrai il nome utente dall'URL (supporta HTTPS con o senza token)
GITHUB_USER=$(echo "$REPO_URL" | sed -E 's|https://([^@]+@)?github\.com/([^/]+)/.*|\2|')

# 3. Richiesta messaggio di commit
read -p "📝 Inserisci il messaggio del commit (premi INVIO per 'Aggiornamento'): " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Aggiornamento"
fi

# 4. Git add e commit
echo "⏳ Sto aggiungendo le modifiche all'indice..."
git add .
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "ℹ️ Nessuna modifica da committare. Procedo con il controllo dei push pendenti..."

# 5. Determina il branch corrente
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# 6. Sincronizzazione
echo "🚀 Sincronizzazione con GitHub in corso (branch: $BRANCH)..."
env GIT_TERMINAL_PROMPT=0 git pull origin "$BRANCH" --rebase 2>/dev/null || true

echo "Inviando le modifiche al remoto..."

# Primo tentativo senza prompt interattivo
env GIT_TERMINAL_PROMPT=0 git push origin "$BRANCH" && {
    echo "---------------------------------------------------------"
    echo "✅ Push completato con successo! Tutto allineato su GitHub."
    exit 0
}

# 7. Fallback: richiesta token PAT
echo "⚠️ Autenticazione richiesta o token scaduto/mancante."
AUTH_REPO_URL=$(request_token "$REPO_URL")

echo "🔄 Aggiorno l'URL del remote con il nuovo token..."
git remote set-url origin "$AUTH_REPO_URL"

echo "🚀 Riprovo il push..."
git push origin "$BRANCH" && {
    echo "✅ Push completato con successo! Token salvato nel remote origin."
} || {
    echo "❌ Errore durante il push. Verifica che il Token sia valido e abbia i permessi 'repo'."
    exit 1
}
