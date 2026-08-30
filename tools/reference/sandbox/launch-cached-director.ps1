[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$cachePath = "C:\Reference\Director8Cache"
$manifestPath = Join-Path $cachePath "cache-manifest.json"
$sourceDirPath = "C:\Reference\Originals\spacedpenguin_bigidea_20020806.dir"
$authoringPath = "C:\Reference\Authoring"
$workingDirPath = Join-Path $authoringPath "spacedpenguin_instrumented.dir"
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$statusPath = Join-Path $authoringPath "authoring-boot-$runId.json"
$expectedInstallerSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DirectorCachedLauncherNativeMethods
{
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);
}
"@

function Get-RootPaths {
    return @{
        ProgramFilesX86 = ${env:ProgramFiles(x86)}
        ProgramFiles = $env:ProgramFiles
        CommonProgramFilesX86 = ${env:CommonProgramFiles(x86)}
        CommonProgramFiles = $env:CommonProgramFiles
        ProgramData = $env:ProgramData
    }
}

try {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Director cache manifest is missing."
    }
    if (-not (Test-Path -LiteralPath $sourceDirPath)) {
        throw "Reconstructed canonical DIR is not available at $sourceDirPath."
    }

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1) {
        throw "Unsupported Director cache schema $($manifest.schemaVersion)."
    }
    if ($manifest.installerSha256 -ne $expectedInstallerSha256) {
        throw "Director cache was prepared from an unexpected installer."
    }

    $rootPaths = Get-RootPaths
    foreach ($directory in $manifest.directories) {
        $rootPath = $rootPaths[$directory.root]
        if (-not $rootPath) {
            throw "Director cache uses unknown destination root '$($directory.root)'."
        }

        $sourcePath = Join-Path (Join-Path (Join-Path $cachePath "payload") $directory.root) $directory.relativePath
        $destinationPath = Join-Path $rootPath $directory.relativePath
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            throw "Director cache directory is missing: $sourcePath"
        }
        New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
        Get-ChildItem -LiteralPath $sourcePath -Force |
            Copy-Item -Destination $destinationPath -Recurse -Force
    }

    foreach ($registryFile in $manifest.registryFiles) {
        $registryFilePath = Join-Path (Join-Path $cachePath "payload\Registry") $registryFile
        if (-not (Test-Path -LiteralPath $registryFilePath)) {
            throw "Director cache registry file is missing: $registryFilePath"
        }
        $registryImport = Start-Process -FilePath reg.exe `
            -ArgumentList @("import", ('"{0}"' -f $registryFilePath)) `
            -WindowStyle Hidden `
            -Wait `
            -PassThru
        if ($registryImport.ExitCode -ne 0) {
            throw "Could not restore Director registry file $registryFile."
        }
    }

    $directorRootPath = $rootPaths[$manifest.director.root]
    if (-not $directorRootPath) {
        throw "Director cache uses unknown executable root '$($manifest.director.root)'."
    }
    $directorPath = Join-Path $directorRootPath $manifest.director.relativePath
    if (-not (Test-Path -LiteralPath $directorPath)) {
        throw "Cached Director.exe was not restored to $directorPath."
    }

    New-Item -ItemType Directory -Force -Path $authoringPath | Out-Null
    if (-not (Test-Path -LiteralPath $workingDirPath)) {
        Copy-Item -LiteralPath $sourceDirPath -Destination $workingDirPath
    }

    $directorLaunchStartedAt = Get-Date
    $directorLauncher = Start-Process -FilePath $directorPath -ArgumentList ('"{0}"' -f $workingDirPath) -PassThru
    $directorDeadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        Start-Sleep -Milliseconds 250
        $director = Get-Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.StartTime -ge $directorLaunchStartedAt.AddSeconds(-2) -and
                $_.MainWindowHandle -ne [IntPtr]::Zero -and
                ($_.MainWindowTitle -match "(^| - )Director 8$")
            } |
            Sort-Object StartTime -Descending |
            Select-Object -First 1
    } while (-not $director -and [DateTime]::UtcNow -lt $directorDeadline)
    if (-not $director) {
        throw "Cached Director 8 launched, but its authoring process could not be identified."
    }

    Start-Sleep -Seconds 8
    $director.Refresh()
    [DirectorCachedLauncherNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")

    [PSCustomObject]@{
        status = "authoring-started"
        startupMode = "restored-from-cache"
        runId = $runId
        cacheCreatedAtUtc = $manifest.createdAtUtc
        directorLauncherProcessId = $directorLauncher.Id
        directorProcessId = $director.Id
        directorWindowTitle = $director.MainWindowTitle
        directorExecutable = $directorPath
        workingDir = [IO.Path]::GetFileName($workingDirPath)
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
catch {
    [PSCustomObject]@{
        status = "error"
        startupMode = "restored-from-cache"
        runId = $runId
        message = $_.Exception.Message
        exceptionType = $_.Exception.GetType().FullName
        scriptStackTrace = $_.ScriptStackTrace
        positionMessage = $_.InvocationInfo.PositionMessage
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
