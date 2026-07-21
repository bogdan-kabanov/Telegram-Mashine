#!/usr/bin/env python3
import os, paramiko
from pathlib import Path
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.142.47.131", username="root", key_filename=str(KEY), timeout=30)
cmds = [
    "grep APP_URL /opt/bot-ai/.env",
    "docker exec bot-ai node -e \"fetch('https://api.telegram.org').then(r=>console.log('tg',r.status)).catch(e=>console.error(e))\"",
    "curl -s -X POST http://127.0.0.1:3000/api/telegram/setup",
    "curl -s https://95-142-47.131.sslip.io/api/telegram/setup",
    "docker exec bot-ai printenv APP_URL",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    print((stdout.read()+stderr.read()).decode("utf-8", errors="replace").strip())
c.close()
