#!/usr/bin/env bash
# Fast native rebuild & restart (no Docker). Keeps .env, SQLite, renders, node_modules cache.
set -eu

APP_DIR="${APP_DIR:-/opt/bot-ai}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env missing in $APP_DIR"
  exit 1
fi

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
PORT="${PORT:-3000}"
BASE_PATH="$(grep -E '^BASE_PATH=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
BASE_PATH="${BASE_PATH:-}"
BASE_PATH="${BASE_PATH%/}"
HEALTH_URL="http://127.0.0.1:${PORT}${BASE_PATH}/api/health"

BROWSERS_PATH="$(grep -E '^PLAYWRIGHT_BROWSERS_PATH=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
BROWSERS_PATH="${BROWSERS_PATH:-/opt/ms-playwright}"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export NODE_ENV=production

mkdir -p data/logs data/runtime data/reviews data/renders public/renders "$BROWSERS_PATH"

echo "==> npm ci"
npm ci

# Chromium only if missing (saves minutes on every deploy)
if [ ! -d "$BROWSERS_PATH" ] || [ -z "$(ls -A "$BROWSERS_PATH" 2>/dev/null || true)" ]; then
  echo "==> Playwright Chromium install"
  npx playwright install-deps chromium || true
  npx playwright install chromium
else
  echo "==> Playwright browsers already present at $BROWSERS_PATH"
fi

echo "==> next build"
npm run build

echo "==> restart systemd"
install -m 644 "$APP_DIR/deploy/bot-ai.service" /etc/systemd/system/bot-ai.service
systemctl daemon-reload
systemctl enable bot-ai
systemctl restart bot-ai

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
  systemctl status bot-ai --no-pager || true
  journalctl -u bot-ai -n 80 --no-pager || true
  exit 1
fi

curl -fsS -X POST "http://127.0.0.1:${PORT}${BASE_PATH}/api/admin/control" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' >/dev/null 2>&1 || true

echo "==> status"
systemctl --no-pager --full status bot-ai | head -n 18
echo "Done (native)."
