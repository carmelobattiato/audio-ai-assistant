#!/bin/bash
# Build and package the Calendar Bridge extension.
# Output: public/calendar-extension.zip  (served as static asset by Vite)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SRC="$ROOT/extension"
STAGING="$ROOT/public/calendar-extension"
ZIP="$ROOT/public/calendar-extension.zip"

if [ ! -d "$SRC" ]; then
  echo "Error: extension/ directory not found at $SRC" >&2
  exit 1
fi

# Clean previous build
rm -rf "$STAGING" "$ZIP"

# Copy extension files
cp -r "$SRC" "$STAGING"

# Package
cd "$ROOT/public"
zip -r calendar-extension.zip calendar-extension/ -x "*.DS_Store"
cd "$ROOT"

# Cleanup staging dir
rm -rf "$STAGING"

echo "✓  Built: public/calendar-extension.zip ($(du -sh "$ZIP" | cut -f1))"
