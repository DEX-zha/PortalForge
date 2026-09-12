# T034: read the IGA v4 header words of every level archive on the disc, one file at a time,
# without keeping the game data (each extracted file is deleted after its header is read).
param([string]$Out = "..\..\.local\disc\level-headers.jsonl")
$ErrorActionPreference = 'Stop'
$game = (Get-Content ..\..\.local\dolphin-config.json -Raw | ConvertFrom-Json).game
$tmp = "..\..\.local\disc\headers-tmp"
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
if (Test-Path $Out) { Remove-Item $Out }
$paths = node cli.mjs disc-list --game "$game" --filter 'level/.*\.(arc|bld)$'
$i = 0
foreach ($p in $paths) {
  $i++
  node cli.mjs disc-extract --game "$game" --path $p --out $tmp | Out-Null
  $f = Join-Path $tmp ("DATA\files\" + ($p -replace '/', '\'))
  $j = node cli.mjs info "$f" --json | ConvertFrom-Json
  [pscustomobject]@{ path = $p; size = $j.size; count = $j.count; words = $j.header_words; compression = $j.compression; chunk_values = $j.chunk_table_values; issues = $j.issues } | ConvertTo-Json -Compress | Add-Content -Encoding utf8 $Out
  Remove-Item $f -Force
  Write-Output ("{0,3}/{1} {2} count={3} w10=0x{4:x} w14={5} w24={6} w28={7}" -f $i, $paths.Count, $p, $j.count, $j.header_words[4], $j.header_words[5], $j.header_words[9], $j.header_words[10])
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "done: $i archives -> $Out"
