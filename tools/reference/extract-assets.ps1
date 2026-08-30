[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$toolDir = Join-Path $projectRoot ".tools\director-cast-ripper-2.7-d10"
$archivePath = Join-Path $toolDir "DirectorCastRipper_D10.zip"
$appDir = Join-Path $toolDir "app"
$toolPath = Join-Path $appDir "DirectorCastRipper.exe"
$archiveSha256 = "e91de4c786c5a4e31ab960709596b93c20f1e3eb874aa252519f520b1cc6be2f"

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

New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    curl.exe -L --fail --silent --show-error `
        --output $archivePath `
        "https://github.com/n0samu/DirectorCastRipper/releases/download/v2.7/DirectorCastRipper_D10.zip"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not download Director Cast Ripper."
    }
}

$actualArchiveHash = Get-Sha256 -Path $archivePath
if ($actualArchiveHash -ne $archiveSha256) {
    throw "Checksum mismatch for Director Cast Ripper. Expected $archiveSha256, got $actualArchiveHash."
}

if (-not (Test-Path -LiteralPath $appDir)) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $appDir
}

$input = Join-Path $projectRoot "reference\originals\files\spacedpenguin_bigidea_20020806.dcr"
$output = Join-Path $projectRoot "reference\derived\cast-ripper\bigidea-20020806"
New-Item -ItemType Directory -Force -Path $output | Out-Null

if (@(Get-ChildItem -LiteralPath $output -Recurse -File).Count -eq 0) {
    $arguments = @(
        "--cli"
        "--movies", ('"' + $input + '"')
        "--output-folder", ('"' + $output + '"')
        "--member-types", "all"
        "--formats", "png", "bmp", "html", "rtf", "txt"
        "--include-names"
        "--dismiss-dialogs"
    )
    $process = Start-Process `
        -FilePath $toolPath `
        -ArgumentList $arguments `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Director Cast Ripper exited with code $($process.ExitCode)."
    }
}

$files = @(Get-ChildItem -LiteralPath $output -Recurse -File)
if ($files.Count -lt 250) {
    throw "Asset extraction looks incomplete: only $($files.Count) files were produced."
}

Write-Host "Extracted $($files.Count) reference files to $output"
