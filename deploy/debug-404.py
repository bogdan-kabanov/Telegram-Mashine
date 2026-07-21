#!/usr/bin/env python3
import os
from pathlib import Path
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "95.142.47.131",
    username="root",
    key_filename=str(Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"),
)

cmds = [
    "curl -s -o /dev/null -w 'local-c191:%{http_code} type:%{content_type}\\n' http://127.0.0.1:3000/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png",
    "curl -s -o /dev/null -w 'local-4416:%{http_code} type:%{content_type}\\n' http://127.0.0.1:3000/renders/4416c5ca-a570-44fa-b3e5-e7751e901214_screen_1.png",
    "curl -s -o /dev/null -w 'hosthdr:%{http_code}\\n' -H 'Host: 95-142-47-131.sslip.io' http://127.0.0.1:3000/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png",
    "curl -sI https://95-142-47-131.sslip.io/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png | head -20",
    "curl -sI http://127.0.0.1:3000/icons/telegram-input-sticker.svg | head -15",
    "docker exec bot-ai ls -la /app/public/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png",
    "cat /etc/nginx/sites-enabled/bot-ai",
]

for cmd in cmds:
    print(f"\n$ {cmd[:140]}")
    _, o, e = c.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", errors="replace")[:2500])
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR", err[:400])

c.close()
