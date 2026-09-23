#!/bin/bash

# Uso:
#   ./github.sh                push delle modifiche locali su GitHub
#   ./github.sh --pull-force   scarica il remoto e sovrascrive tutto il locale (chiede conferma)
#
# Salva URL e token in ~/.github_push_config (mai committato).

set -euo pipefail

# ── Modalità --pull-force ──────────────────────────────────────────────────────
if [[ "${1:-}" == "--pull-force" ]]; then
    echo ""
    echo "⚠️  ATTENZIONE: --pull-force sovrascriverà TUTTE le modifiche locali"
    echo "   con quanto presente sul branch remoto."
    echo "   Le modifiche non committate andranno PERSE."
    echo ""
    read -r -p "   Sei sicuro? (scrivi 'si' per confermare): " CONFIRM </dev/tty
    if [[ "$CONFIRM" != "si" ]]; then
        echo "❌ Operazione annullata."
        exit 0
    fi
    echo ""
    echo "🔄 Fetch + reset --hard su origin/main..."
    git fetch origin
    REMOTE_DEFAULT=$(git remote show origin 2>/dev/null \
        | grep 'HEAD branch' | sed 's/.*: //' || echo "main")
    git reset --hard "origin/${REMOTE_DEFAULT}"
    echo "✅ Progetto locale allineato con origin/${REMOTE_DEFAULT}."
    exit 0
fi

CONFIG_FILE="$HOME/.github_push_config"

# Cross-platform sed -i
sedi() {
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

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
    echo "💾 URL e token salvati in $CONFIG_FILE" >&2
}

# ── Helpers URL ────────────────────────────────────────────────────────────────
strip_token() {
    # Rimuove il token dall'URL: https://TOKEN@github.com/... → https://github.com/...
    echo "$1" | sed -E 's|https://[^@]+@(github\.com)|https://\1|'
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

# ── Target repository ──────────────────────────────────────────────────────────
_show_target() {
    local url
    url=$(git remote get-url origin 2>/dev/null || true)
    [[ -z "$url" ]] && url="${SAVED_REPO_URL:-}"
    [[ -z "$url" ]] && { echo "🎯 Target: (nessun remote configurato)"; return; }
    echo "🎯 Target: $(strip_token "$url")"
}
_show_target

# ── Pre-flight: rilevamento bump orfano da run precedente fallita ─────────────
# Se il working tree contiene una APP_VERSION diversa da quella in HEAD significa
# che una run precedente ha fatto bump_version ma il commit non è andato a buon
# fine (es. git identity mancante, hook fallito, conflitto). Senza cleanup ogni
# nuova run incrementa di nuovo creando salti di versione e voci CHANGELOG duplicate.
detect_orphan_bump() {
    local config_file="constants/appConfig.ts"
    [[ ! -f "$config_file" ]] && return 0
    [[ ! -d ".git" ]] && return 0
    local current head
    current=$(grep 'APP_VERSION' "$config_file" 2>/dev/null \
        | sed 's/.*"\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/') || true
    head=$(git show HEAD:"$config_file" 2>/dev/null | grep 'APP_VERSION' \
        | sed 's/.*"\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/') || true
    [[ -z "$current" || -z "$head" ]] && return 0
    [[ "$current" == "$head" ]] && return 0
    echo ""
    echo "⚠️  Bump orfano rilevato: working tree v$current, HEAD v$head."
    echo "    Probabile run precedente fallita dopo il bump ma prima del commit."
    read -r -p "    Revertire CHANGELOG.md / README.md / $config_file al HEAD? (s/n, default s): " ANS </dev/tty
    if [[ "$ANS" != "n" && "$ANS" != "N" ]]; then
        git checkout HEAD -- CHANGELOG.md README.md "$config_file" 2>/dev/null || true
        echo "✅ File bump-related ripristinati al HEAD (v$head)."
    else
        echo "⏭  Salto il revert. Lo script proseguirà con stato inconsistente."
    fi
}

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

# Cleanup pre-commit: revert bump orfano da run precedente fallita
detect_orphan_bump

# ── Estrae sezione [Unreleased] da CHANGELOG.md ───────────────────────────────
get_latest_changelog() {
    local changelog="CHANGELOG.md"
    [[ ! -f "$changelog" ]] && return
    # Legge solo il blocco ## [Unreleased], esclude righe vuote iniziali/finali
    awk '/^## \[Unreleased\]/{found=1;next} found && /^## \[/{exit} found && !/^---/{print}' \
        "$changelog" | sed '/^[[:space:]]*$/d'
}

# ── Bump versione minor ────────────────────────────────────────────────────────
bump_version() {
    local commit_msg="$1"
    local config_file="constants/appConfig.ts"
    local readme_file="README.md"
    local changelog_file="CHANGELOG.md"

    # Legge versione corrente
    local current_version
    current_version=$(grep 'APP_VERSION' "$config_file" 2>/dev/null \
        | sed 's/.*"\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/') || true

    if [[ -z "$current_version" ]]; then
        echo "⚠️  Versione non trovata in $config_file, bump saltato." >&2
        return 0
    fi

    local major minor new_version today
    major=$(echo "$current_version" | cut -d. -f1)
    minor=$(echo "$current_version" | cut -d. -f2)
    new_version="${major}.$((minor + 1))"
    today=$(date "+%Y-%m-%d")

    # 1. appConfig.ts
    sedi "s/APP_VERSION = \"$current_version\"/APP_VERSION = \"$new_version\"/" \
        "$config_file"

    # 2. README.md — aggiorna solo l'header di versione
    if [[ -f "$readme_file" ]]; then
        sedi "s/— v${current_version}/— v${new_version}/" "$readme_file"
    fi

    # 4. CHANGELOG.md — promuove [Unreleased] → [new_version], crea nuovo [Unreleased] vuoto
    if [[ -f "$changelog_file" ]]; then
        # Costruisce i bullet points dal commit_msg
        local bullets=""
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            if [[ "$line" == -\ * ]]; then
                bullets+="$line"$'\n'
            else
                bullets+="- $line"$'\n'
            fi
        done <<< "$commit_msg"

        # Scrive il file risultante riga per riga tramite un tmp
        local tmp
        tmp=$(mktemp)
        local in_unreleased=0
        while IFS= read -r line; do
            if [[ "$line" == "## [Unreleased]" ]]; then
                # Inserisce nuovo [Unreleased] vuoto
                printf '## [Unreleased]\n\n---\n\n' >> "$tmp"
                # Poi la riga del nuovo versioned header
                printf '## [%s] — %s\n\n' "$new_version" "$today" >> "$tmp"
                printf '%s\n' "$bullets" >> "$tmp"
                in_unreleased=1
                continue
            fi
            # Salta le righe dei vecchi bullet points di [Unreleased] e il suo separatore
            if [[ $in_unreleased -eq 1 ]]; then
                if [[ "$line" == "---" ]]; then
                    in_unreleased=0
                fi
                continue
            fi
            printf '%s\n' "$line" >> "$tmp"
        done < "$changelog_file"
        mv "$tmp" "$changelog_file"
    fi

    echo "🔖 Versione: v${current_version} → v${new_version}" >&2
}

# ── 4. Commit ──────────────────────────────────────────────────────────────────
# Strategia transazionale: stage prima, poi rilevamento changes; bump SOLO se
# c'è effettivamente qualcosa da committare; rollback bump se commit fallisce.
# Evita: doppi bump quando il commit fallisce silenziosamente, salti di versione,
# voci CHANGELOG duplicate.

echo "⏳ Aggiungo le modifiche..."
git add .

# Niente staged → niente commit né bump, prosegui col push (caso: commit locali
# già fatti ma non ancora pushati)
if git diff --cached --quiet; then
    echo "ℹ️  Nessuna modifica da committare. Controllo push pendenti..."
else
    # Legge la sezione [Unreleased] dal CHANGELOG come testo suggerito
    CHANGELOG_DEFAULT="$(get_latest_changelog)"

    if [[ -n "$CHANGELOG_DEFAULT" ]]; then
        echo ""
        echo "📋 CHANGELOG.md → [Unreleased] (default commit):"
        echo "---------------------------------------------------------"
        echo "$CHANGELOG_DEFAULT"
        echo "---------------------------------------------------------"
        echo "  → Premi INVIO per usarla, oppure digita un messaggio personalizzato."
        echo ""
    fi

    read -p "📝 Messaggio commit: " COMMIT_MSG

    if [[ -z "$COMMIT_MSG" ]] && [[ -n "$CHANGELOG_DEFAULT" ]]; then
        COMMIT_MSG="$CHANGELOG_DEFAULT"
    elif [[ -z "$COMMIT_MSG" ]]; then
        COMMIT_MSG="Aggiornamento"
    fi

    bump_version "$COMMIT_MSG"
    git add CHANGELOG.md README.md constants/appConfig.ts 2>/dev/null || true

    # Capture stderr per distinguere errori reali (identity, hook, ecc.)
    if ! COMMIT_ERR=$(git commit -m "$COMMIT_MSG" 2>&1); then
        echo "❌ Commit fallito:"
        echo "$COMMIT_ERR" | sed 's/^/    /'
        echo ""
        echo "⏪ Rollback del bump versione per evitare stato inconsistente alla prossima run..."
        git checkout HEAD -- CHANGELOG.md README.md constants/appConfig.ts 2>/dev/null || true
        echo "    Risolvi l'errore sopra e rilancia ./github.sh"
        exit 1
    fi
fi

# ── 5. Pull + rebase ───────────────────────────────────────────────────────────
echo "🔄 Allineamento con il remote (pull --rebase)..."
PULL_OUT=$(env GIT_TERMINAL_PROMPT=0 git pull origin "$BRANCH" --rebase 2>&1) || PULL_FAIL=1

if [[ "${PULL_FAIL:-0}" == "1" ]]; then
    echo "$PULL_OUT"
    if echo "$PULL_OUT" | grep -qi "uncommitted changes\|unstaged changes\|cannot pull with rebase"; then
        echo ""
        echo "⚠️  Stato non pulito (modifiche non committate). Lo script avrebbe dovuto"
        echo "    committarle prima del pull. Controlla con 'git status' e rilancia."
        exit 1
    fi
    echo ""
    echo "⚠️  Conflitti rilevati durante il rebase. Risolvili manualmente:"
    echo "    1. Controlla i file in conflitto:  git status"
    echo "    2. Risolvi i conflitti nei file"
    echo "    3. Segna come risolti:             git add <file>"
    echo "    4. Continua il rebase:             git rebase --continue"
    echo "    5. Poi riesegui:                   ./github.sh"
    exit 1
fi
echo "$PULL_OUT"

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
