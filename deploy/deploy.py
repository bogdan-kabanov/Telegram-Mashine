#!/usr/bin/env python3
"""Deploy bot-ai to remote server via SSH/SFTP."""
from __future__ import annotations

import os
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "151.245.140.111")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")
DOMAIN = os.environ.get("DEPLOY_DOMAIN", "151-245-140-111.sslip.io")
REMOTE_DIR = "/opt/bot-ai"
PROJECT_ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_DIRS = {
    ".git",
    ".next",
    "node_modules",
    ".cursor",
    "agent-transcripts",
    "terminals",
}
EXCLUDE_FILES = {
    ".env",
    "data/app.db",
    "data/app.db-shm",
    "data/app.db-wal",
}
EXCLUDE_SUFFIXES = (".png", ".html")  # generated renders in data/reviews paths only handled below


def should_skip(path: Path, rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in EXCLUDE_DIRS or any(p in EXCLUDE_DIRS for p in parts):
        return True
    if rel.replace("\\", "/") in EXCLUDE_FILES:
        return True
    norm = rel.replace("\\", "/")
    if "/renders/" in norm and norm.endswith(EXCLUDE_SUFFIXES):
        return True
    if norm.startswith("data/reviews/") and norm.endswith(".json"):
        return False  # keep structure but we skip large review json? keep for now
    if norm.startswith("data/logs/"):
        return True
    return False


def build_archive() -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".tar.gz")
    tmp.close()
    archive = Path(tmp.name)
    print(f"Creating archive: {archive}")
    with tarfile.open(archive, "w:gz") as tar:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            root_path = Path(root)
            rel_root = root_path.relative_to(PROJECT_ROOT).as_posix()
            dirs[:] = [
                d
                for d in dirs
                if d not in EXCLUDE_DIRS
                and (f"{rel_root}/{d}" if rel_root != "." else d) not in EXCLUDE_DIRS
            ]
            for name in files:
                full = root_path / name
                rel = full.relative_to(PROJECT_ROOT).as_posix()
                if should_skip(full, rel):
                    continue
                tar.add(full, arcname=rel)
    size_mb = archive.stat().st_size / (1024 * 1024)
    print(f"Archive size: {size_mb:.1f} MB")
    return archive


def load_local_env() -> dict[str, str]:
    env_path = PROJECT_ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip()
    return values


def ensure_ssh_key(client: paramiko.SSHClient) -> None:
    ssh_dir = Path(os.environ.get("USERPROFILE", "") or os.environ.get("HOME", "")) / ".ssh"
    pubs = [
        ssh_dir / "hostkey_ed25519.pub",
        ssh_dir / "id_ed25519.pub",
        ssh_dir / "id_rsa.pub",
        ssh_dir / "github_actions_bot_ai.pub",
    ]
    installed = 0
    for pub in pubs:
        if not pub.exists():
            continue
        pubkey = pub.read_text(encoding="utf-8").strip()
        if not pubkey or "\n" in pubkey or "'" in pubkey:
            continue
        cmd = (
            "mkdir -p ~/.ssh && chmod 700 ~/.ssh && "
            f"grep -qxF '{pubkey}' ~/.ssh/authorized_keys 2>/dev/null || "
            f"echo '{pubkey}' >> ~/.ssh/authorized_keys && "
            "chmod 600 ~/.ssh/authorized_keys"
        )
        stdin, stdout, stderr = client.exec_command(cmd)
        stdout.channel.recv_exit_status()
        installed += 1
        print(f"SSH public key installed: {pub.name}")
    if not installed:
        print("No local SSH public key found, skipping key install")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> int:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
    if err:
        print(err.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"), file=sys.stderr)
    return code


def main() -> int:
    local_env = load_local_env()
    archive = build_archive()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    ssh_dir = Path(os.environ.get("USERPROFILE", "") or os.environ.get("HOME", "")) / ".ssh"
    key_path = os.environ.get("DEPLOY_SSH_KEY_PATH") or str(ssh_dir / "hostkey_ed25519")
    if Path(key_path).exists():
        client.connect(HOST, username=USER, key_filename=key_path, timeout=30)
        print(f"SSH: key auth OK ({Path(key_path).name})")
    elif PASSWORD:
        client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
        print("SSH: password auth OK")
    else:
        raise RuntimeError(f"No SSH key/password for {USER}@{HOST}")
    ensure_ssh_key(client)

    sftp = client.open_sftp()
    try:
        run(client, f"mkdir -p {REMOTE_DIR}")
        remote_archive = f"/tmp/bot-ai-deploy.tar.gz"
        print(f"Uploading to {remote_archive}...")
        sftp.put(str(archive), remote_archive)
        run(
            client,
            f"cd {REMOTE_DIR} && tar -xzf {remote_archive} && rm -f {remote_archive}",
        )

        env_content = f"""NODE_ENV=production
TELEGRAM_BOT_TOKEN={local_env.get('TELEGRAM_BOT_TOKEN', '')}
TELEGRAM_WEBHOOK_SECRET={local_env.get('TELEGRAM_WEBHOOK_SECRET', '')}
TELEGRAM_ADMIN_IDS={local_env.get('TELEGRAM_ADMIN_IDS', '')}
TELEGRAM_PUBLISH_CHANNEL_ID={local_env.get('TELEGRAM_PUBLISH_CHANNEL_ID', '')}
APP_URL=https://{DOMAIN}
PORT=3000
OPENAI_API_KEY={local_env.get('OPENAI_API_KEY', '')}
OPENAI_MODEL={local_env.get('OPENAI_MODEL', 'gpt-4o-mini')}
AI_CLIENT_PHOTOS={local_env.get('AI_CLIENT_PHOTOS', 'fallback')}
OPENAI_IMAGE_MODEL={local_env.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')}
AI_RECEIPTS={local_env.get('AI_RECEIPTS', 'fallback')}
OPENAI_RECEIPT_IMAGE_MODEL={local_env.get('OPENAI_RECEIPT_IMAGE_MODEL', 'gpt-image-1')}
AI_MEDIA={local_env.get('AI_MEDIA', 'fallback')}
DATA_DIR=/opt/bot-ai/data
CONFIG_DIR=/opt/bot-ai/config
PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
AUTO_SETUP_WEBHOOK=1
"""
        with sftp.file(f"{REMOTE_DIR}/.env", "w") as f:
            f.write(env_content)
        run(client, f"chmod 600 {REMOTE_DIR}/.env")
    finally:
        sftp.close()

    setup_path = REMOTE_DIR + "/deploy/remote-setup-native.sh"
    run(client, f"chmod +x {REMOTE_DIR}/deploy/*.sh")
    code = run(
        client,
        f"export DEPLOY_DOMAIN={DOMAIN} DEPLOY_HOST={HOST} && bash {setup_path}",
        timeout=7200,
    )

    archive.unlink(missing_ok=True)
    client.close()

    if code != 0:
        print(f"Setup exited with code {code}", file=sys.stderr)
        return code

    print(f"\nDeployment complete: https://{DOMAIN}/admin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
