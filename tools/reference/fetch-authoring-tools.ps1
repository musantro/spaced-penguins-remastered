[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$destinationFolder = Join-Path $projectRoot ".tools\director8-trial"
$destinationPath = Join-Path $destinationFolder "director8trial.exe"
$sourceUrl = "https://web.archive.org/web/20030920165749id_/http://www.ntu.edu.sg/cits2/software/download/director8trial.exe"
$expectedBytes = 22855075
$expectedSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $hasher = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $hasher.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

New-Item -ItemType Directory -Force -Path $destinationFolder | Out-Null

if (-not (Test-Path -LiteralPath $destinationPath)) {
    Write-Host "Downloading the archived Director 8 trial without executing it..."
    $temporaryPath = "$destinationPath.download"
    curl.exe -L --fail --silent --show-error --output $temporaryPath $sourceUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed for $sourceUrl"
    }
    Move-Item -LiteralPath $temporaryPath -Destination $destinationPath
}

$actualBytes = (Get-Item -LiteralPath $destinationPath).Length
$actualSha256 = Get-Sha256 -Path $destinationPath
if ($actualBytes -ne $expectedBytes -or $actualSha256 -ne $expectedSha256) {
    throw "Director 8 trial verification failed. Expected $expectedBytes bytes / $expectedSha256; got $actualBytes bytes / $actualSha256."
}

Write-Host "Verified $destinationPath"
