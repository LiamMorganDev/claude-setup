# Turn this PC's Tailscale + MagicDNS on only while needed.
#   pwsh -File ~/.claude/scripts/tailscale.ps1 up     # connect, MagicDNS on, wait until online
#   pwsh -File ~/.claude/scripts/tailscale.ps1 down   # MagicDNS off, disconnect
#   pwsh -File ~/.claude/scripts/tailscale.ps1 status
param([Parameter(Mandatory)][ValidateSet('up', 'down', 'status')][string]$Action)
$ErrorActionPreference = 'Stop'

$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts) { $ts = 'C:\Program Files\Tailscale\tailscale.exe' }
if (-not (Test-Path $ts)) { throw "tailscale CLI not found" }

function Show-State {
  $s = & $ts status --json | ConvertFrom-Json
  $p = & $ts debug prefs | ConvertFrom-Json
  "Tailscale: $($s.BackendState) | MagicDNS (accept-dns): $($p.CorpDNS)"
}

switch ($Action) {
  'up' {
    & $ts set --accept-dns=true
    & $ts up
    if ($LASTEXITCODE) { throw "tailscale up failed ($LASTEXITCODE)" }
    $deadline = (Get-Date).AddSeconds(30)
    while ((& $ts status --json | ConvertFrom-Json).BackendState -ne 'Running') {
      if ((Get-Date) -gt $deadline) { throw "Tailscale did not reach Running in 30s" }
      Start-Sleep -Milliseconds 500
    }
  }
  'down' {
    & $ts set --accept-dns=false
    & $ts down
    if ($LASTEXITCODE) { throw "tailscale down failed ($LASTEXITCODE)" }
  }
}
Show-State
