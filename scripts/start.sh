#!/bin/sh
# Serve the built site. Reads TYPESAFE_API_KEY (and friends) from .env.local.
cd "$(dirname "$0")/.." || exit 1
if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8080}"
exec /.sprite/languages/bun/bin/bun ./dist/server/entry.mjs
