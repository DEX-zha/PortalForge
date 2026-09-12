param([switch]$Register)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$localRoot = Join-Path $projectRoot '.local'
$archive = Join-Path $localRoot 'downloads\dolphin-scripting-preview4-x64.7z'
$runtime = Join-Path $localRoot 'dolphin-felk'
Get-Command node,npm,tar -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Force (Split-Path $archive),$runtime | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -UseBasicParsing 'https://github.com/Felk/dolphin/releases/download/scripting-preview4/dolphin-scripting-preview4-x64.7z' -OutFile $archive
}
# Recorded SHA-256 of the tested release asset, not a publisher signature.
$expectedHash = 'FC6B298852B54AAED71C7E925919ACED0B56CECA7289BFCC07C06B4F47970DA0'
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Dolphin archive hash mismatch' }
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'Dolphin.exe'))) {
  & tar -xf $archive -C $runtime
  if ($LASTEXITCODE -ne 0) { throw 'Dolphin extraction failed' }
}
Push-Location $PSScriptRoot
try {
  & npm ci --ignore-scripts --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw 'MCP dependencies installation failed' }
  & npm run smoke
  if ($LASTEXITCODE -ne 0) { throw 'MCP smoke test failed' }
  if ($Register) {
    & codex mcp add dolphin -- (Get-Command node).Source (Join-Path $PSScriptRoot 'server.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Codex MCP registration failed' }
  }
} finally { Pop-Location }
