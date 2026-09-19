#!/usr/bin/env bash
# First-time (or migrate-from-Docker) native install: Node + Playwright + nginx + systemd.
set -eu

APP_DIR="${APP_DIR:-/opt/bot-ai}"
DOMAIN="${DEPLOY_DOMAIN:-151-245-140-111.sslip.io}"
HOST_IP="${DEPLOY_HOST:-151.245.140.111}"
APP_URL="https://${DOMAIN}"
BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/ms-playwright}"
NODE_MAJOR="${NODE_MAJOR:-22}"

export DEBIAN_FRONTEND=noninteractive

echo "==> Prefer IPv4 (Telegram AAAA often broken on VPS)"
if ! grep -q 'precedence ::ffff:0:0/96  100' /etc/gai.conf 2>/dev/null; then
  echo 'precedence ::ffff:0:0/96  100' >> /etc/gai.conf
fi
cat > /etc/sysctl.d/99-disable-ipv6.conf <<'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF
sysctl --system >/dev/null 2>&1 || true

echo "==> Stop Docker app if present (free :3000)"
if command -v docker >/dev/null 2>&1; then
  (cd "$APP_DIR" && docker compose down 2>/dev/null) || true
  docker stop bot-ai 2>/dev/null || true
  docker rm bot-ai 2>/dev/null || true
fi

echo "==> Base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release nginx certbot python3-certbot-nginx ufw \
  build-essential python3 pkg-config libsqlite3-dev

echo "==> Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" != "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v
npm -v

mkdir -p "$APP_DIR" "$BROWSERS_PATH"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env missing — upload before running setup"
  exit 1
fi

# Native paths (not container paths)
if grep -q '^DATA_DIR=' .env; then
  sed -i 's|^DATA_DIR=.*|DATA_DIR=/opt/bot-ai/data|' .env
else
  echo 'DATA_DIR=/opt/bot-ai/data' >> .env
fi
if grep -q '^CONFIG_DIR=' .env; then
  sed -i 's|^CONFIG_DIR=.*|CONFIG_DIR=/opt/bot-ai/config|' .env
else
  echo 'CONFIG_DIR=/opt/bot-ai/config' >> .env
fi
if grep -q '^PLAYWRIGHT_BROWSERS_PATH=' .env; then
  sed -i "s|^PLAYWRIGHT_BROWSERS_PATH=.*|PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH}|" .env
else
  echo "PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH}" >> .env
fi
grep -q '^APP_URL=' .env || echo "APP_URL=${APP_URL}" >> .env
sed -i "s|^APP_URL=.*|APP_URL=${APP_URL}|" .env
grep -q '^PORT=' .env || echo 'PORT=3000' >> .env
grep -q '^AUTO_SETUP_WEBHOOK=' .env || echo 'AUTO_SETUP_WEBHOOK=1' >> .env
chmod 600 .env

mkdir -p data/logs data/runtime data/reviews data/renders public/renders

echo "==> npm ci"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm ci

echo "==> Playwright Chromium + OS deps (once)"
npx playwright install-deps chromium
npx playwright install chromium

echo "==> next build"
npm run build

echo "==> systemd unit"
install -m 644 "$APP_DIR/deploy/bot-ai.service" /etc/systemd/system/bot-ai.service
systemctl daemon-reload
systemctl enable bot-ai
systemctl restart bot-ai

echo "==> Nginx"
cat > /etc/nginx/sites-available/bot-ai <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} ${HOST_IP};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/bot-ai /etc/nginx/sites-enabled/bot-ai
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> SSL"
if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "SSL OK for ${DOMAIN}"
else
  echo "WARN: certbot failed — HTTP only"
fi

echo "==> Firewall"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

echo "==> Wait health + webhook"
ok=0
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "ERROR: healthcheck failed"
  systemctl status bot-ai --no-pager || true
  journalctl -u bot-ai -n 80 --no-pager || true
  exit 1
fi

curl -fsS -X POST "http://127.0.0.1:3000/api/telegram/setup" || true
curl -fsS -X POST "http://127.0.0.1:3000/api/admin/control" \
  -H 'Content-Type: application/json' -d '{"action":"start"}' || true

echo "==> Done (native)"
echo "Admin: ${APP_URL}/admin"
systemctl --no-pager --full status bot-ai | head -n 20
