#!/usr/bin/env python3
import paramiko
import os
from pathlib import Path

HOST = "80.78.248.96"
USER = "root"
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(HOST, username=USER, key_filename=str(KEY), timeout=30)
    except Exception:
        c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return c

def run(client, cmd, timeout=7200):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out[-8000:] if len(out) > 8000 else out)
    if err.strip():
        print("STDERR:", err[-4000:] if len(err) > 4000 else err)
    print(f"exit={code}")
    return code

client = connect()

cmds = [
    "cd /opt/bot-ai && cat > docker-compose.override.yml <<'EOF'\nservices:\n  app:\n    ports:\n      - \"127.0.0.1:3000:3000\"\nEOF",
    "cd /opt/bot-ai && docker compose up -d --build 2>&1 | tail -n 80",
    "cd /opt/bot-ai && docker compose ps",
    "curl -s http://127.0.0.1:3000/api/health | head -c 500 || true",
    "certbot --nginx -d 80-78-248-96.sslip.io --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1 | tail -n 20 || true",
    "curl -s -X POST http://127.0.0.1:3000/api/telegram/setup | head -c 400 || true",
    "curl -s -X POST http://127.0.0.1:3000/api/admin/control -H 'Content-Type: application/json' -d '{\"action\":\"start\"}' | head -c 200 || true",
    "curl -s -o /dev/null -w 'https:%{http_code}' https://80-78-248-96.sslip.io/api/health || true",
]

for cmd in cmds:
    code = run(client, cmd)
    if "docker compose up" in cmd and code != 0:
        break

client.close()
