#!/usr/bin/env bash
#
# test-custom-endpoint.sh — diagnostica un endpoint LLM "Custom OpenAI-compatible".
#
# Replica quello che fa l'app nel browser (POST /chat/completions) e verifica i
# tre motivi tipici di "Failed to fetch": endpoint irraggiungibile, path errato,
# CORS mancante.
#
# COME USARE: incolla i tuoi valori qui sotto, salva, e lancia:
#   ./scripts/test-custom-endpoint.sh
#
set -u

# ─── INCOLLA QUI I TUOI VALORI ────────────────────────────────────────────────
BASE_URL="https://gemini.genai-garage.accenture.com"   # base URL del proxy
MODEL="gemini-3.6-flash"                                # nome modello
API_KEY="AIzaSyDtU8gXuJxGYp3flI8xBtH76rdUaDCQRlk"                                             # token/API key (vuoto = test senza auth)
ORIGIN="http://localhost:3000"                         # origine simulata del browser (per CORS)
TIMEOUT="12"                                           # secondi per richiesta
# ──────────────────────────────────────────────────────────────────────────────

if [ -z "$BASE_URL" ]; then
  echo "Compila BASE_URL in cima allo script." >&2
  exit 2
fi

BASE="${BASE_URL%/}"   # togli slash finale
URL="$BASE/chat/completions"

AUTH=()
if [ -n "$API_KEY" ]; then
  AUTH=(-H "Authorization: Bearer ${API_KEY}")
  echo "• API key: presente (Bearer)"
else
  echo "• API key: assente (test senza auth — molti proxy risponderanno 401/403/404)"
fi
echo "• Base URL : $BASE"
echo "• Model    : $MODEL"
echo "• Origin   : $ORIGIN"
echo "• Endpoint : POST $URL"
echo

PAYLOAD="{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}"

# ── 1. Raggiungibilità (DNS + TCP + TLS) ──────────────────────────────────────
echo "=== 1) Raggiungibilità ==="
curl -sS -m "$TIMEOUT" -o /dev/null \
  -w "  HTTP %{http_code} | dns:%{time_namelookup}s connect:%{time_connect}s tls:%{time_appconnect}s total:%{time_total}s\n" \
  -X POST "$URL" -H "Content-Type: application/json" "${AUTH[@]}" -d "$PAYLOAD" \
  || { echo "  ✗ irraggiungibile (curl exit $?). Controlla DNS/VPN/host."; exit 1; }
echo

# ── 2. CORS preflight (il vero motivo di "Failed to fetch" nel browser) ───────
echo "=== 2) CORS preflight (OPTIONS) ==="
CORS_HDRS=$(curl -sS -m "$TIMEOUT" -D - -o /dev/null -X OPTIONS "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" 2>&1)
echo "$CORS_HDRS" | grep -iE "^HTTP/|access-control" | sed 's/^/  /'
if echo "$CORS_HDRS" | grep -qi "access-control-allow-origin"; then
  echo "  ✓ header CORS presenti → il browser potrà leggere la risposta"
else
  echo "  ✗ NESSUN header CORS → un'app browser vedrà \"Failed to fetch\" (serve backend proxy o CORS lato server)"
fi
echo

# ── 3. POST reale: header + status + corpo ────────────────────────────────────
echo "=== 3) POST /chat/completions (risposta reale) ==="
curl -sS -m "$TIMEOUT" -D - -o /dev/null \
  -X POST "$URL" -H "Content-Type: application/json" -H "Origin: $ORIGIN" "${AUTH[@]}" -d "$PAYLOAD" 2>&1 \
  | grep -iE "^HTTP/|^content-type:|^server:|^www-authenticate:" | sed 's/^/  /'
BODY=$(mktemp)
CODE=$(curl -sS -m "$TIMEOUT" -o "$BODY" -w "%{http_code}" \
  -X POST "$URL" -H "Content-Type: application/json" "${AUTH[@]}" -d "$PAYLOAD" 2>/dev/null)
echo "  → HTTP $CODE"
echo "  --- primi 400 char del corpo ---"
head -c 400 "$BODY" | sed 's/^/  /'
echo; echo
rm -f "$BODY"

# ── 4. Path alternativi (se il 404 è per rotta sbagliata) ─────────────────────
echo "=== 4) Path alternativi (HTTP code) ==="
for p in "/chat/completions" "/v1/chat/completions" "/openai/v1/chat/completions" "/v1/models" "/models"; do
  c=$(curl -sS -m "$TIMEOUT" -o /dev/null -w "%{http_code}" \
      -X POST "$BASE$p" -H "Content-Type: application/json" "${AUTH[@]}" -d "$PAYLOAD" 2>/dev/null)
  echo "  POST $p -> $c"
done
echo

echo "Legenda: 200=ok · 401/403=auth mancante/errata · 404=path errato o non esposto · 000=timeout/irraggiungibile"
echo "Ricorda: anche con path+auth corretti, un'app SOLO-browser richiede header CORS lato server."
