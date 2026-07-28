# Requires: gh auth login
# Sets Actions secrets for Deploy workflow from local deploy key.

$ErrorActionPreference = "Stop"
$hostName = "95.142.47.131"
$user = "root"
$keyPath = Join-Path $env:USERPROFILE ".ssh\github_actions_bot_ai"

if (-not (Test-Path $keyPath)) {
  throw "Missing deploy key: $keyPath — create with ssh-keygen first"
}

gh auth status | Out-Null
gh secret set DEPLOY_HOST --body $hostName
gh secret set DEPLOY_USER --body $user
gh secret set DEPLOY_SSH_KEY < $keyPath

Write-Host "Secrets set. Trigger: gh workflow run Deploy.yml"
Write-Host "Or push to main / Actions → Deploy → Run workflow"
