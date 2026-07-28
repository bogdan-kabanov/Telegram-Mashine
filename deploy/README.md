# Deploy & CI/CD

Production: `https://95-142-47-131.sslip.io/admin`  
Server path: `/opt/bot-ai` · Docker Compose + Nginx + Let’s Encrypt

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
| `CI` | push/PR → `main` | `npm ci`, typecheck, vitest |
| `Deploy` | push → `main` or manual | SCP archive → SSH → `deploy/remote-update.sh` |

### Required repository secrets

Settings → Secrets and variables → Actions:

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | `95.142.47.131` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | private key PEM (`-----BEGIN OPENSSH PRIVATE KEY-----` …) |
| `DEPLOY_SSH_PORT` | `22` (optional) |
| `DEPLOY_APP_DIR` | `/opt/bot-ai` (optional) |

Also create a GitHub **Environment** named `production` (Actions → Environments), or remove `environment: production` from `.github/workflows/deploy.yml`.

### Install deploy key on the server (once)

A dedicated key already lives at `~/.ssh/github_actions_bot_ai` on the author machine
(public half is on the VPS). To register secrets:

```powershell
gh auth login
pwsh deploy/setup-github-secrets.ps1
gh workflow run Deploy.yml
```

Or manually in GitHub → Settings → Secrets → Actions:

| Secret | Value |
|--------|--------|
| `DEPLOY_HOST` | `95.142.47.131` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/github_actions_bot_ai` (private key) |

Server `.env` is **not** managed by CI — edit it on the VPS only.
