# Deploy & CI/CD

Production: `https://151-245-140-111.sslip.io/` (panel `/panel`, old admin `/admin`)  
Server: `151.245.140.111` (`fi-vmmini`) · path `/opt/bot-ai`  
Repo: https://github.com/bogdan-kabanov/Telegram-Mashine  
**Runtime: Node.js + systemd + Nginx** (no Docker in production)

## Why native?

Docker rebuilds a ~3.7 GB Playwright image on every deploy. Native updates are `npm ci` + `next build` + `systemctl restart` (Playwright browsers cached in `/opt/ms-playwright`).

## First-time bootstrap

Upload code + `.env`, then on the VPS:

```bash
export DEPLOY_DOMAIN=151-245-140-111.sslip.io
export DEPLOY_HOST=151.245.140.111
bash /opt/bot-ai/deploy/remote-setup-native.sh
```

This installs Node 22, Playwright Chromium + deps, nginx, Let’s Encrypt, and enables `bot-ai.service`.

## Local one-shot update (from your PC)

```powershell
# needs OpenSSH + key: ~/.ssh/hostkey_ed25519
.\deploy\push-native.ps1
```

Or manually: sync code → `bash deploy/remote-update.sh` on the server.

## GitHub Actions

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `CI` | push/PR → `main` | `npm ci`, typecheck, vitest |
| `Deploy` | push → `main` or manual | self-hosted runner → rsync → `deploy/remote-update.sh` |

Deploy runs on the VPS (`runs-on: [self-hosted, linux, bot-ai]`).

### One-time: install self-hosted runner

1. https://github.com/bogdan-kabanov/Telegram-Mashine/settings/actions/runners/new  
2. On the server:

```bash
scp deploy/install-github-runner.sh root@151.245.140.111:/tmp/
ssh root@151.245.140.111 'RUNNER_TOKEN=XXXX bash /tmp/install-github-runner.sh'
```

## Ops

```bash
systemctl status bot-ai
journalctl -u bot-ai -f
systemctl restart bot-ai
```

Server `.env` is **not** managed by CI — edit on the VPS only.

Docker (`Dockerfile` / `docker compose`) remains for optional local/prod experiments; production path above is native.
