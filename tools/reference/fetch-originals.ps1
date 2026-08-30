[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$filesDir = Join-Path $projectRoot "reference\originals\files"
New-Item -ItemType Directory -Force -Path $filesDir | Out-Null

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

function Get-VerifiedFile {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Sha256
    )

    $destination = Join-Path $filesDir $Name
    if (Test-Path -LiteralPath $destination) {
        $actual = Get-Sha256 -Path $destination
        if ($actual -ne $Sha256) {
            throw "Checksum mismatch for existing file $destination. Expected $Sha256, got $actual."
        }
        Write-Host "Verified $Name"
        return
    }

    $temporary = Join-Path $filesDir ".$Name.download"
    curl.exe -L --fail --silent --show-error --output $temporary $Url
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed for $Url"
    }

    $actual = Get-Sha256 -Path $temporary
    if ($actual -ne $Sha256) {
        throw "Checksum mismatch for $Name. Expected $Sha256, got $actual."
    }

    Move-Item -LiteralPath $temporary -Destination $destination
    Write-Host "Downloaded and verified $Name"
}

Get-VerifiedFile `
    -Name "Doom_Funnel.zip" `
    -Url "https://archive.org/download/BIDVD2005/Doom_Funnel.zip" `
    -Sha256 "9621b27df00f8c055621aa67a5b6d2312cd4d2aaa706241d6f4b7ba594049d6c"

Get-VerifiedFile `
    -Name "spacedpenguin_bigidea_20020806.dcr" `
    -Url "https://web.archive.org/web/20020806025619id_/http://www.bigideafun.com/penguins/arcade/spaced_penguin/spaced_penguin.dcr" `
    -Sha256 "22d7a9f9455467c277a0ea920cf1042073f7744446aaecb40476f586941df102"

Get-VerifiedFile `
    -Name "spacedpenguin_albinoblacksheep.dcr" `
    -Url "https://www.albinoblacksheep.com/swf/shockwave/spacedpenguin(www.albinoblacksheep.com).dcr" `
    -Sha256 "1b9b2c3878de8bc04551b21a2923352b8f4ae688ea6966aa7fc68731498cb614"

$archivePath = Join-Path $filesDir "Doom_Funnel.zip"
$dvdDir = Join-Path $filesDir "dvd_rom"
if (-not (Test-Path -LiteralPath $dvdDir)) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $dvdDir
}

$projectorCopies = @(
    Join-Path $dvdDir "games\Spaced_Penguin.exe"
    Join-Path $dvdDir "fscommand\Spaced_Penguin.exe"
)
foreach ($projector in $projectorCopies) {
    $actual = Get-Sha256 -Path $projector
    if ($actual -ne "318c0d9c2cb8357c006c017fb3875e75808754b3a2571a54b5f66f5fa9149584") {
        throw "Checksum mismatch for extracted projector $projector."
    }
}

Write-Host "Original artifacts are ready in $filesDir"
