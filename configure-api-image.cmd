@echo off
setlocal

powershell.exe -NoProfile -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$relayUrl = (Read-Host 'Enter relay base URL, for example https://relay.example.com/v1').Trim();" ^
  "if ([string]::IsNullOrWhiteSpace($relayUrl)) { throw 'Relay URL cannot be empty.' };" ^
  "if ($relayUrl -match '^\[.*\]\(.*\)$') { throw 'Enter a plain URL, not a Markdown link.' };" ^
  "try { $uri = [Uri]$relayUrl; if ($uri.Scheme -notin @('http','https') -or [string]::IsNullOrWhiteSpace($uri.Host)) { throw 'Invalid URL.' } } catch { throw 'Enter a valid http:// or https:// URL.' };" ^
  "$secureKey = Read-Host 'Enter API key (input is hidden)' -AsSecureString;" ^
  "$credential = New-Object System.Management.Automation.PSCredential('relay', $secureKey);" ^
  "$apiKey = $credential.GetNetworkCredential().Password;" ^
  "if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API key cannot be empty.' };" ^
  "[Environment]::SetEnvironmentVariable('CODEX_IMAGE_RELAY_BASE_URL', $relayUrl, 'User');" ^
  "[Environment]::SetEnvironmentVariable('CODEX_IMAGE_RELAY_API_KEY', $apiKey, 'User');" ^
  "[Environment]::SetEnvironmentVariable('CODEX_IMAGE_RELAY_MODEL', 'gpt-image-2.5-sunburst', 'User');" ^
  "$storedUrl = [Environment]::GetEnvironmentVariable('CODEX_IMAGE_RELAY_BASE_URL', 'User');" ^
  "$storedKey = [Environment]::GetEnvironmentVariable('CODEX_IMAGE_RELAY_API_KEY', 'User');" ^
  "$storedModel = [Environment]::GetEnvironmentVariable('CODEX_IMAGE_RELAY_MODEL', 'User');" ^
  "if ($storedUrl -ne $relayUrl -or [string]::IsNullOrWhiteSpace($storedKey) -or $storedModel -ne 'gpt-image-2.5-sunburst') { throw 'Configuration verification failed.' };" ^
  "Write-Host 'Configuration saved and verified. Restart Codex.' -ForegroundColor Green;" ^
  "$apiKey = $null; $storedKey = $null;"

if errorlevel 1 (
  echo.
  echo Configuration failed. Run this file from a normal Windows session, outside the Codex terminal.
) else (
  echo.
  echo Done. Close this window and restart Codex.
)

pause
endlocal
