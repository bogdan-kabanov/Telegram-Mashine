#!/usr/bin/env bash
# Install + register a self-hosted GitHub Actions runner for bot-ai deploy.
# Usage:
#   RUNNER_TOKEN=XXXX bash deploy/install-github-runner.sh
# Token: repo → Settings → Actions → Runners → New self-hosted runner
set -euo pipefail

REPO="${GITHUB_REPO:-bogdan-kabanov/ai-telegram-panel}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_NAME="${RUNNER_NAME:-bot-ai-vps}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,bot-ai}"
RUNNER_VERSION="${RUNNER_VERSION:-2.336.0}"
SERVICE_NAME="actions.runner.bot-ai"

if [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "ERROR: set RUNNER_TOKEN (registration token from GitHub → Runners → New)"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root"
  exit 1
fi

command -v curl >/dev/null
command -v tar >/dev/null
command -v docker >/dev/null
command -v rsync >/dev/null

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) GH_ARCH="x64" ;;
  aarch64|arm64) GH_ARCH="arm64" ;;
  *) echo "ERROR: unsupported arch $ARCH"; exit 1 ;;
esac

TGZ="actions-runner-linux-${GH_ARCH}-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TGZ}"

if [ ! -f ./config.sh ]; then
  echo "==> download $URL"
  curl -fsSL -o "$TGZ" "$URL"
  tar xzf "$TGZ"
  rm -f "$TGZ"
fi

systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true

if [ -f ./config.sh ] && [ -f ./.runner ]; then
  ./config.sh remove --token "$RUNNER_TOKEN" >/dev/null 2>&1 || true
fi

echo "==> configure $RUNNER_NAME labels=$RUNNER_LABELS"
# Single-purpose deploy VPS: runner must drive docker + /opt/bot-ai as root.
export RUNNER_ALLOW_RUNASROOT=1
./config.sh --unattended \
  --url "https://github.com/${REPO}" \
  --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --work "_work" \
  --replace

echo "==> install systemd unit $SERVICE_NAME"
cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=GitHub Actions Runner (${RUNNER_NAME})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${RUNNER_DIR}
ExecStart=${RUNNER_DIR}/run.sh
User=root
Group=root
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min
Restart=always
RestartSec=10
Environment=DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
Environment=RUNNER_ALLOW_RUNASROOT=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "==> status"
systemctl --no-pager --full status "$SERVICE_NAME" || true
echo "Done. Runner should show Idle in GitHub → Settings → Actions → Runners."
