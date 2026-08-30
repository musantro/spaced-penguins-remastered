[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$toolDir = Join-Path $projectRoot ".tools\projectorrays-0.2.0"
$toolPath = Join-Path $toolDir "projectorrays-0.2.0.exe"
$toolSha256 = "e9814428ee503cf129b6f5cff54524177b7bdd63201a9095d8d19433535c70db"

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
if (-not (Test-Path -LiteralPath $toolPath)) {
    curl.exe -L --fail --silent --show-error `
        --output $toolPath `
        "https://github.com/ProjectorRays/ProjectorRays/releases/download/v0.2.0/projectorrays-0.2.0.exe"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not download ProjectorRays."
    }
}

$actualToolHash = Get-Sha256 -Path $toolPath
if ($actualToolHash -ne $toolSha256) {
    throw "Checksum mismatch for ProjectorRays. Expected $toolSha256, got $actualToolHash."
}

$filesDir = Join-Path $projectRoot "reference\originals\files"
$inputs = @(
    "spacedpenguin_bigidea_20020806.dcr"
    "spacedpenguin_albinoblacksheep.dcr"
)

foreach ($inputName in $inputs) {
    $inputPath = Join-Path $filesDir $inputName
    $outputPath = [IO.Path]::ChangeExtension($inputPath, ".dir")
    if (-not (Test-Path -LiteralPath $outputPath)) {
        & $toolPath decompile $inputPath
        if ($LASTEXITCODE -ne 0) {
            throw "ProjectorRays failed while decompiling $inputPath."
        }
    }
    Write-Host "Ready: $outputPath"
}
