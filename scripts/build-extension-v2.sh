#!/bin/bash
# Build e pacchettizza Calendar Bridge v2.
# Output: public/calendar-bridge-v2.zip
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SRC="$ROOT/extension-v2"
STAGING="$ROOT/public/calendar-bridge-v2"
ZIP="$ROOT/public/calendar-bridge-v2.zip"

if [ ! -d "$SRC" ]; then
  echo "Error: extension-v2/ not found" >&2
  exit 1
fi

rm -rf "$STAGING" "$ZIP"
cp -r "$SRC" "$STAGING"

# Copia icone dall'extension v1 se non presenti
if [ ! -d "$STAGING/icons" ] && [ -d "$ROOT/extension/icons" ]; then
  cp -r "$ROOT/extension/icons" "$STAGING/icons"
fi

cd "$ROOT/public"
zip -r calendar-bridge-v2.zip calendar-bridge-v2/ -x "*.DS_Store"
cd "$ROOT"
rm -rf "$STAGING"

echo "✓  Built: public/calendar-bridge-v2.zip ($(du -sh "$ZIP" | cut -f1))"
