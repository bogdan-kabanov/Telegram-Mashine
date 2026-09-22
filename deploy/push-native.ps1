# Fast sync + native remote-update (no Docker).
# Usage:  .\deploy\push-native.ps1
$ErrorActionPreference = "Stop"

$HostIp = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "151.245.140.111" }
$Domain = if ($env:DEPLOY_DOMAIN) { $env:DEPLOY_DOMAIN } else { "151-245-140-111.sslip.io" }
$Key = if ($env:DEPLOY_SSH_KEY_PATH) { $env:DEPLOY_SSH_KEY_PATH } else { Join-Path $env:USERPROFILE ".ssh\hostkey_ed25519" }
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Archive = Join-Path $env:TEMP "bot-ai-native.tar.gz"

if (-not (Test-Path $Key)) { throw "SSH key not found: $Key" }

Write-Host "==> Packing (exclude node_modules/.next/data media)..."
if (Test-Path $Archive) { Remove-Item -Force $Archive }
Push-Location $Root
tar -czf $Archive `
  --exclude=.git `
  --exclude=node_modules `
  --exclude=panel/node_modules `
  --exclude=.next `
  --exclude=.cursor `
  --exclude=tmp `
  --exclude=agent-transcripts `
  --exclude=terminals `
  --exclude=.env `
  --exclude=data/app.db `
  --exclude=data/app.db-shm `
  --exclude=data/app.db-wal `
  --exclude=data/logs `
  --exclude=data/reviews `
  --exclude=data/renders `
  --exclude=data/runtime `
  --exclude=data/media `
  --exclude=public/renders `
  .
Pop-Location
Write-Host ("Archive: {0:N1} MB" -f ((Get-Item $Archive).Length / 1MB))

Write-Host "==> Upload + extract"
scp -i $Key -o StrictHostKeyChecking=accept-new $Archive "root@${HostIp}:/tmp/bot-ai-native.tar.gz"
ssh -i $Key -o StrictHostKeyChecking=accept-new "root@$HostIp" @"
set -euo pipefail
mkdir -p /opt/bot-ai
tar -xzf /tmp/bot-ai-native.tar.gz -C /opt/bot-ai
rm -f /tmp/bot-ai-native.tar.gz
chmod +x /opt/bot-ai/deploy/*.sh
export DEPLOY_DOMAIN=$Domain DEPLOY_HOST=$HostIp APP_DIR=/opt/bot-ai
bash /opt/bot-ai/deploy/remote-update.sh
"@

Remove-Item -Force $Archive -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done: https://$Domain/panel"
