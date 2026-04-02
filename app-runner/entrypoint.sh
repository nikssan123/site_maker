#!/bin/sh
set -e

STORE_DIR="${PNPM_STORE_DIR:-/generated-apps/.pnpm-store}"
WARM_MARKER="${STORE_DIR}/.warmed"

# Invalidate the warm marker when seed/package.json changes (new deps added).
SEED_HASH=$(md5sum /seed/package.json 2>/dev/null | cut -d' ' -f1 || echo "none")
STORED_HASH=""
[ -f "$WARM_MARKER" ] && STORED_HASH=$(cat "$WARM_MARKER" 2>/dev/null || echo "")

if [ "$SEED_HASH" != "$STORED_HASH" ]; then
  echo "[app-runner] Pre-warming pnpm store at $STORE_DIR (seed hash: $SEED_HASH) ..."
  mkdir -p "$STORE_DIR"
  pnpm install \
    --dir /seed \
    --store-dir "$STORE_DIR" \
    --no-lockfile \
    2>&1 || true
  echo "$SEED_HASH" > "$WARM_MARKER"
  echo "[app-runner] pnpm store pre-warm complete."
fi

exec node /app/dist/index.js
