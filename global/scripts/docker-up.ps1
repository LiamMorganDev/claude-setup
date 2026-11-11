# Starts Docker Desktop and blocks until the engine answers. No-op if it's already up.
#   pwsh -File ~/.claude/scripts/docker-up.ps1
#
# Why: Docker Desktop 4.5x on Windows leaves dead AF_UNIX socket files behind after a stop
# (Docker\run\dockerInference, docker-secrets-engine\engine.sock). They can't be deleted
# (Error 1920 "file cannot be accessed by the system"), so the next start crashes with
# "starting services: ... remove <sock>: The file cannot be accessed by the system".
# Renaming the parent folder works, and Docker recreates it on start.
$ErrorActionPreference = 'Continue'
$TimeoutS = 180

function Test-Engine { docker info --format '{{.ServerVersion}}' *> $null; $LASTEXITCODE -eq 0 }

function Clear-StaleSockets {
  Get-Process 'Docker Desktop', 'com.docker.*' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  $stamp = Get-Date -Format yyyyMMddHHmmss
  foreach ($dir in "$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine") {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $stuck = Get-ChildItem -LiteralPath $dir -Force | Where-Object {
      try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop; $false } catch { $true }
    }
    if ($stuck) {
      Rename-Item -LiteralPath $dir -NewName "$(Split-Path $dir -Leaf).stale-$stamp"
      Write-Host "Moved aside stale sockets: $dir"
    }
  }
  # Old .stale-* folders: try to delete, ignore the ones Windows still won't let go of.
  Get-ChildItem $env:LOCALAPPDATA, "$env:LOCALAPPDATA\Docker" -Directory -Filter '*.stale-*' -ErrorAction SilentlyContinue |
    Where-Object Name -NotLike "*$stamp" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Engine) { Write-Host 'Docker engine already running.'; exit 0 }

# Clean only when Docker isn't mid-start; otherwise give the running start a chance first.
if (-not (Get-Process 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue)) { Clear-StaleSockets }

for ($try = 1; $try -le 2; $try++) {
  docker desktop start --timeout $TimeoutS
  if (Test-Engine) { Write-Host 'Docker engine ready.'; exit 0 }
  if ($try -eq 1) { Write-Host 'Start failed - clearing stale sockets and retrying once.'; Clear-StaleSockets }
}
Write-Error "Docker engine still not up. Check the Docker Desktop error dialog / $env:LOCALAPPDATA\Docker\log\host."
exit 1
