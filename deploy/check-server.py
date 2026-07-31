#!/usr/bin/env python3
import os
import paramiko
import sys

HOST = "80.78.248.96"
USER = "root"
KEY = __import__("pathlib").Path(__import__("os").environ["USERPROFILE"]) / ".ssh" / "id_ed25519"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(HOST, username=USER, key_filename=str(KEY), timeout=30)
except Exception:
    client.connect(HOST, username=USER, password=os.environ.get("DEPLOY_SSH_PASSWORD", "") or None, timeout=30)

cmds = [
    "uname -a",
    "docker --version 2>/dev/null || echo no-docker",
    "docker compose version 2>/dev/null || echo no-compose",
    "systemctl is-active nginx 2>/dev/null || echo nginx-inactive",
    "docker ps -a 2>/dev/null || true",
    "curl -s -o /dev/null -w 'health:%{http_code}' http://127.0.0.1:3000/api/health || echo health-fail",
    "curl -s -o /dev/null -w 'nginx:%{http_code}' http://127.0.0.1/ || echo nginx-fail",
    "test -f /opt/bot-ai/deploy/remote-setup.sh && echo setup-script-ok || echo no-setup",
    "tail -n 5 /var/log/nginx/error.log 2>/dev/null || true",
]

for cmd in cmds:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip(), file=sys.stderr)

client.close()
