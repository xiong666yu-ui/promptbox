# PromptBox — one-click release packaging
# Usage: right-click -> Run with PowerShell, or:  .\package.ps1
# Output: promptbox-release.zip (upload this to the Chrome Developer Dashboard)

$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$zip = Join-Path $src "promptbox-release.zip"

# Only production files ship; docs, packaging script, privacy page and
# editor leftovers are excluded.
$include = @(
  "manifest.json",
  "background.js",
  "content.js",
  "inject.css",
  "payment.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "welcome.html",
  "icons"
)

$stage = Join-Path $env:TEMP "promptbox-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item $stage -ItemType Directory -Force | Out-Null

foreach ($item in $include) {
  $from = Join-Path $src $item
  if (-not (Test-Path $from)) { Write-Warning "Missing production file: $item"; continue }
  Copy-Item $from (Join-Path $stage $item) -Recurse -Force
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force

Write-Host ""
Write-Host "Packed OK -> $zip" -ForegroundColor Green
Write-Host "Contents:"
Get-ChildItem $src -File | Where-Object { $_.Name -notin @("STORE_LISTING.md","privacy.html","package.ps1") } |
  ForEach-Object { Write-Host ("  " + $_.Name) }
Write-Host "  icons\ (16/48/128)"
