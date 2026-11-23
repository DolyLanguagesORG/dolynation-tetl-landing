#!/bin/sh
set -eu

OUT_FILE="/usr/share/nginx/html/runtime-config.js"
RAW_URL="${APP_BASE_URL:-}"
CLEAN_URL="$(printf '%s' "$RAW_URL" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s:/*$::')"

case "$CLEAN_URL" in
  http://*|https://*)
    if printf '%s' "$CLEAN_URL" | grep -Eq '^https?://[A-Za-z0-9._:/-]+$'; then
      printf 'window.__DOLY_CONFIG__ = { appBaseUrl: "%s" };\n' "$CLEAN_URL" > "$OUT_FILE"
      exit 0
    fi
    ;;
esac

printf 'window.__DOLY_CONFIG__ = {};\n' > "$OUT_FILE"
