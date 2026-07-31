#!/usr/bin/env python3
import os, json
from pathlib import Path
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "80.78.248.96",
    username="root",
    key_filename=str(Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"),
)

cmds = [
    "curl -s 'http://127.0.0.1:3000/api/admin/reviews?projectId=nancy&limit=1'",
    # raw DB paths
    """docker exec bot-ai node -e "const Database=require('better-sqlite3'); const db=new Database('/app/data/app.db'); const r=db.prepare('select id, screenshots from review_packages order by created_at desc limit 1').get(); console.log(JSON.stringify(r,null,2));" """,
]

for cmd in cmds:
    print(f"\n$ {cmd[:100]}")
    _, o, e = c.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", errors="replace")[:3000])
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR", err[:800])

c.close()
