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
for cmd in [
    "cd /opt/bot-ai && docker compose logs --tail 80 app",
    "cd /opt/bot-ai && docker compose ps",
]:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=60)
    print(stdout.read().decode("utf-8", errors="replace"))
    print(stderr.read().decode("utf-8", errors="replace"))
c.close()
