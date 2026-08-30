[CmdletBinding()]
param(
    [ValidateRange(10, 180)][int]$TimeoutSeconds = 110
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$configScript = Join-Path $PSScriptRoot "create-authoring-sandbox-config.ps1"
$configPath = Join-Path $projectRoot ".tools\spaced-penguin-authoring.wsb"
$authoringPath = Join-Path $projectRoot "reference\authoring"
$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"

if (-not (Test-Path -LiteralPath $sandboxExecutable)) {
    throw "Windows Sandbox is not installed or enabled."
}

if (Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue) {
    throw "Windows Sandbox is already running. Close it before starting the authoring laboratory."
}

& $configScript
$startedAt = Get-Date
Start-Process -FilePath $sandboxExecutable -ArgumentList $configPath

$deadline = $startedAt.AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Seconds 1
    $statusFile = Get-ChildItem -LiteralPath $authoringPath -Filter "authoring-boot-*.json" |
        Where-Object LastWriteTime -gt $startedAt |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
} while (-not $statusFile -and (Get-Date) -lt $deadline)

if (-not $statusFile) {
    throw "Timed out after $TimeoutSeconds seconds waiting for the authoring Sandbox."
}

$status = Get-Content -Raw -LiteralPath $statusFile.FullName | ConvertFrom-Json
if ($status.status -eq "error") {
    throw "Authoring Sandbox failed: $($status.message)"
}

$status | ConvertTo-Json -Depth 6
