[CmdletBinding()]
param(
    [switch]$RebuildDirectorCache
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$toolsPath = Join-Path $projectRoot ".tools"
$cachePath = Join-Path $toolsPath "director8-cache"
$cacheManifestPath = Join-Path $cachePath "cache-manifest.json"
$authoringStartScript = Join-Path $projectRoot "tools\reference\start-authoring-sandbox.ps1"
$authoringConfigScript = Join-Path $projectRoot "tools\reference\create-authoring-sandbox-config.ps1"
$authoringConfigPath = Join-Path $toolsPath "spaced-penguin-authoring.wsb"
$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
$expectedInstallerSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"

function Write-SetupStep {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Resolve-PnpmCommand {
    $pnpm = Get-Command pnpm.cmd, pnpm -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pnpm) {
        return [PSCustomObject]@{
            executable = $pnpm.Source
            prefix = @()
        }
    }

    $corepack = Get-Command corepack.cmd, corepack -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($corepack) {
        return [PSCustomObject]@{
            executable = $corepack.Source
            prefix = @("pnpm")
        }
    }

    throw "pnpm is required. Install Node.js 22+ with Corepack, then rerun this script."
}

function Invoke-Pnpm {
    param(
        [Parameter(Mandatory = $true)][PSCustomObject]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Command.executable @($Command.prefix) @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Test-PathWithin {
    param(
        [Parameter(Mandatory = $true)][string]$Child,
        [Parameter(Mandatory = $true)][string]$Parent
    )

    $childPath = [IO.Path]::GetFullPath($Child).TrimEnd("\")
    $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd("\") + "\"
    return $childPath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)
}

function Test-DirectorCache {
    if (-not (Test-Path -LiteralPath $cacheManifestPath)) {
        return $false
    }

    try {
        $manifest = Get-Content -Raw -LiteralPath $cacheManifestPath | ConvertFrom-Json
        if ($manifest.schemaVersion -ne 1 -or
            $manifest.product -ne "Macromedia Director 8 Trial" -or
            $manifest.installerSha256 -ne $expectedInstallerSha256 -or
            -not $manifest.director.root -or
            -not $manifest.director.relativePath) {
            return $false
        }

        $directorPath = Join-Path (
            Join-Path (Join-Path $cachePath "payload") $manifest.director.root
        ) $manifest.director.relativePath
        if (-not (Test-PathWithin -Child $directorPath -Parent $cachePath)) {
            return $false
        }
        if (-not (Test-Path -LiteralPath $directorPath -PathType Leaf)) {
            return $false
        }

        foreach ($directory in $manifest.directories) {
            $directoryPath = Join-Path (
                Join-Path (Join-Path $cachePath "payload") $directory.root
            ) $directory.relativePath
            if (-not (Test-PathWithin -Child $directoryPath -Parent $cachePath) -or
                -not (Test-Path -LiteralPath $directoryPath -PathType Container)) {
                return $false
            }
        }
        foreach ($registryFile in $manifest.registryFiles) {
            $registryPath = Join-Path (Join-Path $cachePath "payload\Registry") $registryFile
            if (-not (Test-PathWithin -Child $registryPath -Parent $cachePath) -or
                -not (Test-Path -LiteralPath $registryPath -PathType Leaf)) {
                return $false
            }
        }
        return $true
    }
    catch {
        return $false
    }
}

function Move-InvalidDirectorCache {
    if (-not (Test-Path -LiteralPath $cachePath)) {
        return
    }

    $resolvedToolsPath = [IO.Path]::GetFullPath($toolsPath).TrimEnd("\")
    $resolvedCachePath = [IO.Path]::GetFullPath($cachePath).TrimEnd("\")
    if (-not (Test-PathWithin -Child $resolvedCachePath -Parent $resolvedToolsPath)) {
        throw "Refusing to move a cache outside the project tools directory: $resolvedCachePath"
    }

    $backupPath = Join-Path $toolsPath ("director8-cache.invalid-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    if (-not (Test-PathWithin -Child $backupPath -Parent $resolvedToolsPath)) {
        throw "Refusing to create a cache backup outside the project tools directory: $backupPath"
    }
    Move-Item -LiteralPath $resolvedCachePath -Destination $backupPath
    Write-Host "Previous cache moved to $backupPath"
}

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
    throw "This setup requires Windows because the reference laboratory uses Windows Sandbox."
}
if (-not (Test-Path -LiteralPath $sandboxExecutable)) {
    throw @"
Windows Sandbox is not installed or enabled. In an Administrator PowerShell run:
  Enable-WindowsOptionalFeature -FeatureName "Containers-DisposableClientVM" -All -Online
Restart Windows if requested, then rerun setup-environment.ps1.
"@
}
if (-not (Test-Path -LiteralPath $authoringStartScript)) {
    throw "Authoring startup script is missing at $authoringStartScript."
}
if (-not (Test-Path -LiteralPath $authoringConfigScript)) {
    throw "Authoring configuration script is missing at $authoringConfigScript."
}

$node = Get-Command node.exe, node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) {
    throw "Node.js 22 or newer is required."
}
$nodeVersionText = (& $node.Source -p "process.versions.node").Trim()
if ($LASTEXITCODE -ne 0 -or [Version]$nodeVersionText -lt [Version]"22.0.0") {
    throw "Node.js 22 or newer is required; found $nodeVersionText."
}
$pnpmCommand = Resolve-PnpmCommand
$authoringOpenedBySetup = $false

Push-Location $projectRoot
try {
    Write-SetupStep "Installing locked Node.js dependencies"
    Invoke-Pnpm -Command $pnpmCommand -Arguments @("install", "--frozen-lockfile")

    Write-SetupStep "Downloading, verifying, and reconstructing the canonical reference files"
    Invoke-Pnpm -Command $pnpmCommand -Arguments @("reference:prepare")

    Write-SetupStep "Downloading and verifying the Director 8 authoring trial"
    Invoke-Pnpm -Command $pnpmCommand -Arguments @("reference:fetch-authoring")

    $cacheWasValid = Test-DirectorCache
    if ($RebuildDirectorCache -or (-not $cacheWasValid -and (Test-Path -LiteralPath $cacheManifestPath))) {
        if (Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue) {
            throw "Close the running Windows Sandbox before rebuilding the Director cache."
        }
        Move-InvalidDirectorCache
        $cacheWasValid = $false
    }

    if (-not $cacheWasValid) {
        if (Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue) {
            throw "Close the running Windows Sandbox before preparing the Director cache."
        }

        Write-SetupStep "Preparing Director once inside the disconnected Windows Sandbox"
        $statusJson = & $authoringStartScript -TimeoutSeconds 180 | Out-String
        $status = $statusJson | ConvertFrom-Json
        if ($status.status -ne "authoring-started" -or $status.startupMode -ne "installed-and-cached") {
            throw "The first authoring launch did not report a completed cache preparation."
        }
        if (-not (Test-DirectorCache)) {
            throw "Director cache validation failed after the first Sandbox launch."
        }
        $authoringOpenedBySetup = $true
        Write-Host "Director was installed once, cached, and opened with $($status.workingDir)."
    }
    else {
        Write-SetupStep "Validating the existing Director cache"
        Write-Host "The reusable Director cache is valid; no installation was run."
    }

    # A first-time launch needs the cache mapping to be writable. Regenerate
    # the saved WSB after preparation so every later launch maps it read-only.
    & $authoringConfigScript
    [xml]$authoringConfig = Get-Content -Raw -LiteralPath $authoringConfigPath
    $cacheMapping = $authoringConfig.Configuration.MappedFolders.MappedFolder |
        Where-Object { $_.SandboxFolder -eq "C:\Reference\Director8Cache" } |
        Select-Object -First 1
    if (-not $cacheMapping -or $cacheMapping.ReadOnly -ne "true") {
        throw "The prepared Director cache was not sealed read-only in the Sandbox configuration."
    }

    $cacheManifest = Get-Content -Raw -LiteralPath $cacheManifestPath | ConvertFrom-Json
    $cacheFiles = Get-ChildItem -LiteralPath $cachePath -File -Recurse
    $cacheBytes = ($cacheFiles | Measure-Object -Property Length -Sum).Sum
    Write-Host "`nEnvironment ready." -ForegroundColor Green
    Write-Host "  Node.js: $nodeVersionText"
    Write-Host "  Director cache: schema $($cacheManifest.schemaVersion), $($cacheFiles.Count) files, $([Math]::Round($cacheBytes / 1MB, 2)) MB"
    Write-Host "  Authoring command: pnpm reference:authoring"
    if ($authoringOpenedBySetup) {
        Write-Host "  Windows Sandbox: open with Director and the reconstructed game loaded"
    }
}
finally {
    Pop-Location
}
