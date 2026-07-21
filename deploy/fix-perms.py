#!/usr/bin/env python3
import os, paramiko
from pathlib import Path
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    c.connect("95.142.47.131", username="root", key_filename=str(KEY), timeout=30)
except Exception:
    c.connect("95.142.47.131", username="root", password=os.environ.get("DEPLOY_SSH_PASSWORD", "") or None, timeout=30)

cmds = [
    "docker run --rm bot-ai:latest id pwuser",
    "mkdir -p /opt/bot-ai/data/logs /opt/bot-ai/data/runtime /opt/bot-ai/data/reviews /opt/bot-ai/data/renders /opt/bot-ai/public/renders",
    "chown -R 1000:1000 /opt/bot-ai/data /opt/bot-ai/config /opt/bot-ai/public/renders",
    "chmod -R u+rwX /opt/bot-ai/data /opt/bot-ai/config /opt/bot-ai/public/renders",
    "cd /opt/bot-ai && docker compose restart",
    "sleep 20 && curl -s http://127.0.0.1:3000/api/health",
    "curl -s https://95-142-47-131.sslip.io/api/health",
    "curl -s -X POST https://95-142-47-131.sslip.io/api/telegram/setup",
    'curl -s -X POST http://127.0.0.1:3000/api/admin/control -H "Content-Type: application/json" -d \'{"action":"start"}\'',
    "cd /opt/bot-ai && docker compose ps",
    "cd /opt/bot-ai && docker compose logs --tail 15 app",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180)
    text = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    print(text or "(empty)")
c.close()
