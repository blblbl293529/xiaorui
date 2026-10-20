param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$python = if (Test-Path -LiteralPath $bundled) { $bundled } else { (Get-Command python -ErrorAction Stop).Source }
Set-Location -LiteralPath $root
Write-Host "Xiaorui: http://127.0.0.1:$Port"
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
& $python server.py --port $Port
