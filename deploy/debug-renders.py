#!/usr/bin/env python3
import os, paramiko
from pathlib import Path
KEY = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.142.47.131", username="root", key_filename=str(KEY), timeout=20)
cmds = [
    "curl -sI http://127.0.0.1:3000/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png | head -15",
    "curl -sI https://95-142-47-131.sslip.io/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png | head -15",
    "curl -s 'http://127.0.0.1:3000/api/admin/reviews?projectId=nancy' | head -c 1200",
    "docker exec bot-ai ls -la /app/public | head -20",
    "docker exec bot-ai ls -la /app/.next/static 2>/dev/null | head -5",
    "ls -la /opt/bot-ai/data/media/avatars/",
    "curl -sI http://127.0.0.1:3000/api/admin/media/file?path=data/media/avatars/preview-default.png | head -10",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    i, o, e = c.exec_command(cmd, timeout=30)
    print((o.read() + e.read()).decode("utf-8", errors="replace")[:2000])
c.close()
