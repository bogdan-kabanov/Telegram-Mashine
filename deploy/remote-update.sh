#!/usr/bin/env bash
# Rebuild & restart bot-ai on the server. Keeps .env, SQLite, and renders.
set -eu

APP_DIR="${APP_DIR:-/opt/bot-ai}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env missing in $APP_DIR"
  exit 1
fi

# Read host port + base path from .env (must match nginx upstream + Next basePath).
PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
PORT="${PORT:-3000}"
BASE_PATH="$(grep -E '^BASE_PATH=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
BASE_PATH="${BASE_PATH:-}"
BASE_PATH="${BASE_PATH%/}"
HEALTH_URL="http://127.0.0.1:${PORT}${BASE_PATH}/api/health"

# Container runs as pwuser (uid 1000). Host-mounted config/data must be writable
# or admin saves fail with EACCES on /app/config/projects.json.
mkdir -p data/logs data/runtime data/reviews data/renders public/renders config
chown -R 1000:1000 data config public/renders 2>/dev/null || true
chmod -R u+rwX data config public/renders 2>/dev/null || true

echo "==> docker compose build"
docker compose build

echo "==> docker compose up -d"
if docker compose up -d --help 2>/dev/null | grep -q -- '--wait'; then
  docker compose up -d --wait --wait-timeout 300
else
  docker compose up -d
fi

echo "==> waiting for health at ${HEALTH_URL}"
ok=0
for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_URL" >/tmp/bot-ai-health.json 2>/dev/null; then
    echo "health OK ($(cat /tmp/bot-ai-health.json))"
    ok=1
    break
  fi
  sleep 3
done

if [ "$ok" != "1" ]; then
  echo "ERROR: healthcheck failed for ${HEALTH_URL}"
  docker compose ps || true
  docker compose logs --tail=80 app || true
  exit 1
fi

curl -fsS -X POST "http://127.0.0.1:${PORT}${BASE_PATH}/api/admin/control" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' >/dev/null 2>&1 || true

echo "==> containers"
docker compose ps
echo "Done."
