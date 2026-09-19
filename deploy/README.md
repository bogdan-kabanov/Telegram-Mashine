# Deploy & CI/CD

Production: `https://151-245-140-111.sslip.io/admin`  
Server: `151.245.140.111` (`fi-vmmini`) · path `/opt/bot-ai` · Docker Compose + Nginx + Let’s Encrypt

## Local one-shot deploy

From a machine that has SSH access to the VPS:

```bash
# optional if key auth is not set up
set DEPLOY_SSH_PASSWORD=...

python deploy/update-server.py
```

This uploads a code archive (keeps remote `.env` + DB + renders) and runs `docker compose build && up -d`.

First-time server bootstrap (packages, nginx, SSL):

```bash
python deploy/deploy.py
```

## GitHub Actions

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `CI` | push/PR → `main` | `npm ci`, typecheck, vitest (GitHub-hosted) |
| `Deploy` | push → `main` or manual | self-hosted runner on VPS → rsync → `deploy/remote-update.sh` |

Deploy runs on the VPS (`runs-on: [self-hosted, linux, bot-ai]`). No inbound SSH from GitHub is required.

### One-time: install self-hosted runner on the VPS

1. Open https://github.com/bogdan-kabanov/ai-telegram-panel/settings/actions/runners/new  
2. Copy the short-lived **registration token**
3. On the server (as root):

```bash
# from a machine with SSH access:
scp deploy/install-github-runner.sh root@80.78.248.96:/tmp/
ssh root@80.78.248.96 'RUNNER_TOKEN=XXXX bash /tmp/install-github-runner.sh'
```

Runner installs under `/opt/actions-runner` as a systemd service (`bot-ai-vps`).

SSH deploy secrets (`DEPLOY_HOST` / `DEPLOY_SSH_KEY`) are optional leftovers from the old SCP flow — not used by current Deploy.

### Local one-shot (still works)

```powershell
python deploy/update-server.py
```

Server `.env` is **not** managed by CI — edit it on the VPS only.
