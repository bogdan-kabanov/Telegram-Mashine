#!/usr/bin/env bash
set -eu

APP_DIR="/opt/bot-ai"
DOMAIN="${DEPLOY_DOMAIN:-151-245-140-111.sslip.io}"
HOST_IP="${DEPLOY_HOST:-151.245.140.111}"
APP_URL="https://${DOMAIN}"

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

echo "==> Installing packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release nginx certbot python3-certbot-nginx ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env missing — upload before running setup"
  exit 1
fi
chmod 600 .env

echo "==> Building and starting containers"
docker compose down 2>/dev/null || true
mkdir -p data/logs data/runtime data/reviews data/renders public/renders
chown -R 1000:1000 data config public/renders 2>/dev/null || true
docker compose up -d --build

echo "==> Nginx config"
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

echo "==> SSL certificate"
if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "SSL OK for ${DOMAIN}"
else
  echo "WARN: certbot failed — HTTP only. Telegram webhook needs HTTPS + domain."
fi

echo "==> Firewall"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

echo "==> Webhook setup"
sleep 15
curl -fsS -X POST "http://127.0.0.1:3000/api/telegram/setup" || true
curl -fsS -X POST "http://127.0.0.1:3000/api/admin/control" -H 'Content-Type: application/json' -d '{"action":"start"}' || true

echo "==> Done"
echo "Admin: ${APP_URL}/admin"
docker compose ps
