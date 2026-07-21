#!/usr/bin/env python3
import os
import tarfile
import tempfile
import paramiko
from pathlib import Path

HOST = "95.142.47.131"
USER = "root"
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "Dockerfile",
    "src/app/admin/page.tsx",
    "src/app/admin/media/page.tsx",
    "src/app/admin/projects/page.tsx",
    "src/app/admin/schedule/page.tsx",
    "src/app/admin/settings/page.tsx",
]

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(HOST, username=USER, key_filename=str(KEY), timeout=30)
    except Exception:
        c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return c

def run(client, cmd, timeout=7200):
    print(f"\n$ {cmd[:140]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = (out + err).strip()
    if text:
        print(text[-12000:])
    print(f"exit={code}")
    return code

client = connect()
sftp = client.open_sftp()
for rel in FILES:
    local = ROOT / rel
    remote = f"/opt/bot-ai/{rel.replace(chr(92), '/')}"
    remote_dir = str(Path(remote).parent).replace("\\", "/")
    run(client, f"mkdir -p {remote_dir}")
    print(f"upload {rel}")
    sftp.put(str(local), remote)
sftp.close()

nginx = """cat > /etc/nginx/sites-available/bot-ai <<'NGINX'
server {
    listen 80;
    server_name 95-142-47-131.sslip.io 95.142.47.131;
    return 301 https://$host$request_uri;
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/bot-ai /etc/nginx/sites-enabled/bot-ai
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx"""

cmds = [
    "cd /opt/bot-ai && docker compose build 2>&1 | tail -n 40",
    "cd /opt/bot-ai && docker compose up -d",
    "sleep 25 && curl -s http://127.0.0.1:3000/api/health",
    nginx,
    "curl -s https://95-142-47-131.sslip.io/api/health",
    "curl -s -X POST https://95-142-47-131.sslip.io/api/telegram/setup",
    "curl -s -X POST http://127.0.0.1:3000/api/admin/control -H 'Content-Type: application/json' -d '{\"action\":\"start\"}'",
    "cd /opt/bot-ai && docker compose ps",
]
for cmd in cmds:
    code = run(client, cmd)
    if "docker compose build" in cmd and code != 0:
        break
client.close()
