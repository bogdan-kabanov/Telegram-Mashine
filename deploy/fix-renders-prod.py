#!/usr/bin/env python3
"""Hotfix screenshots 404: upload changed files, rebuild, fix nginx alias."""
from __future__ import annotations

import os
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "80.78.248.96"
USER = "root"
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")
REMOTE = "/opt/bot-ai"
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "src/app/renders/[filename]/route.ts",
    "src/lib/media/screenshot-url.ts",
    "src/lib/media/resolve.ts",
    "src/modules/chat-renderer/index.ts",
    "src/app/admin/projects/page.tsx",
    "src/app/api/admin/reviews/route.ts",
    "src/app/api/pipeline/generate/route.ts",
    "src/lib/telegram/commands.ts",
]

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
    try:
        c.connect(HOST, username=USER, key_filename=str(key), timeout=30)
    except Exception:
        c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return c

def run(c, cmd, timeout=7200):
    print(f"\n$ {cmd[:140]}")
    i, o, e = c.exec_command(cmd, timeout=timeout)
    text = (o.read() + e.read()).decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if text.strip():
        print(text[-8000:])
    print(f"exit={code}")
    return code

c = connect()
sftp = c.open_sftp()

# Upload via tar to preserve [filename] path
tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".tar.gz")
tmp.close()
with tarfile.open(tmp.name, "w:gz") as tar:
    for rel in FILES:
        local = ROOT / rel
        if not local.exists():
            print("MISSING", rel)
            continue
        tar.add(local, arcname=rel)
        print("pack", rel)

sftp.put(tmp.name, "/tmp/renders-fix.tar.gz")
sftp.close()
Path(tmp.name).unlink(missing_ok=True)

run(c, f"cd {REMOTE} && tar -xzf /tmp/renders-fix.tar.gz && rm -f /tmp/renders-fix.tar.gz")

nginx = r'''bash -lc 'cat > /etc/nginx/sites-available/bot-ai <<'"'"'NGINX'"'"'
server {
    listen 80;
    server_name 80-78-248-96.sslip.io 80.78.248.96;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name 80-78-248-96.sslip.io 80.78.248.96;
    ssl_certificate /etc/letsencrypt/live/80-78-248-96.sslip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/80-78-248-96.sslip.io/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;

    location /renders/ {
        alias /opt/bot-ai/public/renders/;
        expires 1h;
        add_header Cache-Control "public";
        try_files $uri @app;
    }

    location @app {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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
nginx -t && systemctl reload nginx' '''

run(c, nginx)
run(c, f"chown -R 1000:1000 {REMOTE}/public/renders {REMOTE}/data")
run(c, f"cd {REMOTE} && docker compose build 2>&1 | tail -n 30")
run(c, f"cd {REMOTE} && docker compose up -d")
run(c, "sleep 18 && curl -sI http://127.0.0.1:3000/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png | head -12")
run(c, "curl -sI https://80-78-248-96.sslip.io/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png | head -12")
run(c, "curl -s -o /dev/null -w 'admin:%{http_code}\\n' https://80-78-248-96.sslip.io/admin/projects")
run(c, f"cd {REMOTE} && docker compose ps")
c.close()
print("\nFixed renders serving")
