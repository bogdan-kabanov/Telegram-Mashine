#!/usr/bin/env python3
"""Upload new code to server and rebuild Docker (keeps remote .env + DB)."""
from __future__ import annotations

import os
import sys
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "95.142.47.131"
USER = "root"
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")
REMOTE_DIR = "/opt/bot-ai"
PROJECT_ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_DIRS = {".git", ".next", "node_modules", ".cursor", "agent-transcripts", "terminals", "deploy"}
EXCLUDE_PREFIXES = (
    "data/app.db",
    "data/logs/",
    "data/runtime/",
    "data/reviews/",
    "data/renders/",
    "public/renders/",
)


def should_skip(rel: str) -> bool:
    norm = rel.replace("\\", "/")
    parts = norm.split("/")
    if parts[0] in EXCLUDE_DIRS or any(p in EXCLUDE_DIRS for p in parts):
        return True
    if norm in {".env", ".env.local"}:
        return True
    if any(norm.startswith(p) for p in EXCLUDE_PREFIXES):
        return True
    if "/renders/" in norm and norm.endswith((".png", ".html")):
        return True
    return False


def build_archive() -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".tar.gz")
    tmp.close()
    archive = Path(tmp.name)
    with tarfile.open(archive, "w:gz") as tar:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            root_path = Path(root)
            rel_root = root_path.relative_to(PROJECT_ROOT).as_posix()
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for name in files:
                full = root_path / name
                rel = full.relative_to(PROJECT_ROOT).as_posix()
                if should_skip(rel):
                    continue
                tar.add(full, arcname=rel)
    print(f"Archive: {archive.stat().st_size / 1024 / 1024:.1f} MB")
    return archive


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = Path(os.environ.get("USERPROFILE", "")) / ".ssh" / "id_ed25519"
    try:
        client.connect(HOST, username=USER, key_filename=str(key), timeout=30)
    except Exception:
        client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> int:
    print(f"\n$ {cmd[:160]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = (out + err).strip()
    if text:
        print(text[-12000:])
    print(f"exit={code}")
    return code


def main() -> int:
    archive = build_archive()
    client = connect()
    sftp = client.open_sftp()
    remote_archive = "/tmp/bot-ai-update.tar.gz"
    print(f"Uploading to {remote_archive}...")
    sftp.put(str(archive), remote_archive)
    sftp.close()

    cmds = [
        f"cd {REMOTE_DIR} && tar -xzf {remote_archive} && rm -f {remote_archive}",
        # keep production APP_URL / secrets; only ensure AUTO_SETUP if missing
        f"cd {REMOTE_DIR} && grep -q AUTO_SETUP_WEBHOOK .env || echo AUTO_SETUP_WEBHOOK=0 >> .env",
        f"mkdir -p {REMOTE_DIR}/data/logs {REMOTE_DIR}/data/runtime {REMOTE_DIR}/data/reviews {REMOTE_DIR}/data/renders {REMOTE_DIR}/public/renders",
        f"chown -R 1000:1000 {REMOTE_DIR}/data {REMOTE_DIR}/config {REMOTE_DIR}/public/renders",
        f"cd {REMOTE_DIR} && docker compose build 2>&1 | tail -n 50",
        f"cd {REMOTE_DIR} && docker compose up -d",
        "sleep 20 && curl -s http://127.0.0.1:3000/api/health | head -c 400",
        "curl -s -o /dev/null -w 'admin:%{http_code}\\n' https://95-142-47-131.sslip.io/admin",
        "curl -s -o /dev/null -w 'media:%{http_code}\\n' https://95-142-47-131.sslip.io/admin/media",
        "curl -s -o /dev/null -w 'legends:%{http_code}\\n' https://95-142-47-131.sslip.io/admin/settings",
        f"cd {REMOTE_DIR} && docker compose ps",
    ]

    for cmd in cmds:
        code = run(client, cmd)
        if "docker compose build" in cmd and code != 0:
            client.close()
            archive.unlink(missing_ok=True)
            return code

    # try start bot
    run(
        client,
        'curl -s -X POST http://127.0.0.1:3000/api/admin/control -H "Content-Type: application/json" -d \'{"action":"start"}\'',
    )

    client.close()
    archive.unlink(missing_ok=True)
    print("\nDone: https://95-142-47-131.sslip.io/admin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
