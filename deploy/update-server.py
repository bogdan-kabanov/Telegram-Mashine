#!/usr/bin/env python3
"""Upload new code to server and rebuild Docker (keeps remote .env + DB)."""
from __future__ import annotations

import os
import sys
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "80.78.248.96"
USER = "root"
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD", "")
REMOTE_DIR = "/opt/bot-ai"
PROJECT_ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_DIRS = {
    ".git",
    ".next",
    "node_modules",
    ".cursor",
    "agent-transcripts",
    "terminals",
    ".tmp-test-photos",
}
EXCLUDE_PREFIXES = (
    "data/app.db",
    "data/logs/",
    "data/runtime/",
    "data/reviews/",
    "data/renders/",
    "public/renders/",
    "public/2026.",
    ".tmp-",
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
    # junk sticker variants / local preview dumps
    if "greeting.alpha" in norm:
        return True
    if norm.startswith("public/") and "/2026." in f"/{norm}":
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
    ssh_dir = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "") / ".ssh"
    key_candidates = [
        os.environ.get("DEPLOY_SSH_KEY_PATH", ""),
        str(ssh_dir / "id_ed25519"),
        str(ssh_dir / "max_desktop_deploy"),
        str(ssh_dir / "id_rsa"),
    ]
    last_err: Exception | None = None
    for key_path in key_candidates:
        if not key_path or not Path(key_path).exists():
            continue
        try:
            client.connect(HOST, username=USER, key_filename=key_path, timeout=30)
            print(f"SSH: key auth OK ({Path(key_path).name})")
            return client
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    if PASSWORD:
        try:
            client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
            print("SSH: password auth OK")
            return client
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    raise RuntimeError(f"SSH auth failed for {USER}@{HOST}: {last_err}")


def ensure_local_pubkey(client: paramiko.SSHClient) -> None:
    """Install local id_ed25519.pub so later deploys / GitHub Actions key can work."""
    pub = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "") / ".ssh" / "id_ed25519.pub"
    if not pub.exists():
        return
    pubkey = pub.read_text(encoding="utf-8").strip()
    if not pubkey:
        return
    # Avoid shell-injection via pubkey contents: only allow a single SSH public key line.
    if "\n" in pubkey or "'" in pubkey:
        print("SSH: skip pubkey install (unexpected format)")
        return
    cmd = (
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && "
        f"grep -qxF '{pubkey}' ~/.ssh/authorized_keys 2>/dev/null || "
        f"echo '{pubkey}' >> ~/.ssh/authorized_keys && "
        "chmod 600 ~/.ssh/authorized_keys"
    )
    run(client, cmd)
    print("SSH: ensured local id_ed25519.pub on server")


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
    ensure_local_pubkey(client)
    sftp = client.open_sftp()
    remote_archive = "/tmp/bot-ai-update.tar.gz"
    print(f"Uploading to {remote_archive}...")
    sftp.put(str(archive), remote_archive)
    sftp.close()

    cmds = [
        f"cd {REMOTE_DIR} && tar -xzf {remote_archive} && rm -f {remote_archive}",
        # keep production APP_URL / secrets; only ensure AUTO_SETUP if missing
        f"cd {REMOTE_DIR} && grep -q AUTO_SETUP_WEBHOOK .env || echo AUTO_SETUP_WEBHOOK=0 >> .env",
        f"chmod +x {REMOTE_DIR}/deploy/remote-update.sh",
        f"cd {REMOTE_DIR} && bash deploy/remote-update.sh",
        "curl -s -o /dev/null -w 'admin:%{http_code}\\n' https://80-78-248-96.sslip.io/admin",
        "curl -s -o /dev/null -w 'media:%{http_code}\\n' https://80-78-248-96.sslip.io/admin/media",
        "curl -s -o /dev/null -w 'legends:%{http_code}\\n' https://80-78-248-96.sslip.io/admin/settings",
    ]

    for cmd in cmds:
        code = run(client, cmd)
        if "remote-update.sh" in cmd and code != 0:
            client.close()
            archive.unlink(missing_ok=True)
            return code

    client.close()
    archive.unlink(missing_ok=True)
    print("\nDone: https://80-78-248-96.sslip.io/admin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
