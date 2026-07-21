#!/usr/bin/env python3
import os, paramiko
from pathlib import Path
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
ROOT = Path(__file__).resolve().parents[1]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    c.connect("95.142.47.131", username="root", key_filename=str(KEY), timeout=30)
except Exception:
    c.connect("95.142.47.131", username="root", password=os.environ.get("DEPLOY_SSH_PASSWORD", "") or None, timeout=30)

sftp = c.open_sftp()
sftp.put(str(ROOT / "docker-compose.yml"), "/opt/bot-ai/docker-compose.yml")
sftp.close()

cmds = [
    "rm -f /opt/bot-ai/docker-compose.override.yml",
    "cd /opt/bot-ai && docker compose down",
    "cd /opt/bot-ai && docker compose up -d",
    "sleep 25 && curl -s http://127.0.0.1:3000/api/health",
    """bash -lc 'cat > /etc/nginx/sites-available/bot-ai <<\"NGINX\"
server {
    listen 80;
    server_name 95-142-47-131.sslip.io 95.142.47.131;
    return 301 https://\\$host\\$request_uri;
}
server {
    listen 443 ssl;
    server_name 95-142-47-131.sslip.io 95.142.47.131;
    ssl_certificate /etc/letsencrypt/live/95-142-47-131.sslip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/95-142-47-131.sslip.io/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/bot-ai /etc/nginx/sites-enabled/bot-ai
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx'""",
    "curl -s https://95-142-47-131.sslip.io/api/health",
    "curl -s -X POST https://95-142-47-131.sslip.io/api/telegram/setup",
    'curl -s -X POST http://127.0.0.1:3000/api/admin/control -H "Content-Type: application/json" -d \'{"action":"start"}\'',
    "cd /opt/bot-ai && docker compose ps",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180)
    text = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    print(text or "(empty)")
    print("exit", stdout.channel.recv_exit_status())
c.close()
