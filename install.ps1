param(
  [string]$CodexHome = $env:CODEX_HOME
)

if ([string]::IsNullOrWhiteSpace($CodexHome)) {
  $CodexHome = Join-Path $HOME ".codex"
}

$source = $PSScriptRoot
$target = Join-Path $CodexHome "skills\api-image"
New-Item -ItemType Directory -Force -Path $target | Out-Null

Get-ChildItem -LiteralPath $source -Force |
  Where-Object { $_.Name -ne "install.ps1" } |
  Copy-Item -Destination $target -Recurse -Force

Write-Output "Installed API-image Skill to $target"
Write-Output "Set CODEX_IMAGE_RELAY_BASE_URL and CODEX_IMAGE_RELAY_API_KEY for this Windows user, then restart Codex."
