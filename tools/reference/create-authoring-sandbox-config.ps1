[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$originalsFolder = Join-Path $projectRoot "reference\originals\files"
$authoringFolder = Join-Path $projectRoot "reference\authoring"
$instrumentationFolder = Join-Path $projectRoot "reference\instrumentation"
$harnessFolder = Join-Path $projectRoot "tools\reference\sandbox"
$directorTrialFolder = Join-Path $projectRoot ".tools\director8-trial"
$directorCacheFolder = Join-Path $projectRoot ".tools\director8-cache"
$toolsFolder = Join-Path $projectRoot ".tools"
$trialPath = Join-Path $directorTrialFolder "director8trial.exe"
$expectedTrialSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"

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

if (-not (Test-Path -LiteralPath $trialPath)) {
    throw "Director 8 trial is missing at $trialPath. See docs/FIDELITY.md."
}

$actualTrialSha256 = Get-Sha256 -Path $trialPath
if ($actualTrialSha256 -ne $expectedTrialSha256) {
    throw "Director 8 trial checksum mismatch: expected $expectedTrialSha256, got $actualTrialSha256."
}

if (-not (Test-Path -LiteralPath (Join-Path $originalsFolder "spacedpenguin_bigidea_20020806.dir"))) {
    throw "The reconstructed canonical DIR is missing. Run pnpm reference:prepare first."
}

New-Item -ItemType Directory -Force -Path $authoringFolder | Out-Null
New-Item -ItemType Directory -Force -Path $directorCacheFolder | Out-Null
New-Item -ItemType Directory -Force -Path $toolsFolder | Out-Null
$directorCacheReadOnly = if (Test-Path -LiteralPath (Join-Path $directorCacheFolder "cache-manifest.json")) {
    "true"
}
else {
    "false"
}

$escapedOriginals = [Security.SecurityElement]::Escape($originalsFolder)
$escapedAuthoring = [Security.SecurityElement]::Escape($authoringFolder)
$escapedInstrumentation = [Security.SecurityElement]::Escape($instrumentationFolder)
$escapedHarness = [Security.SecurityElement]::Escape($harnessFolder)
$escapedDirectorTrial = [Security.SecurityElement]::Escape($directorTrialFolder)
$escapedDirectorCache = [Security.SecurityElement]::Escape($directorCacheFolder)
$configPath = Join-Path $toolsFolder "spaced-penguin-authoring.wsb"
$config = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Disable</Networking>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <ProtectedClient>Enable</ProtectedClient>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$escapedOriginals</HostFolder>
      <SandboxFolder>C:\Reference\Originals</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedAuthoring</HostFolder>
      <SandboxFolder>C:\Reference\Authoring</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedInstrumentation</HostFolder>
      <SandboxFolder>C:\Reference\Instrumentation</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedHarness</HostFolder>
      <SandboxFolder>C:\Reference\Harness</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedDirectorTrial</HostFolder>
      <SandboxFolder>C:\Reference\Director8Trial</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedDirectorCache</HostFolder>
      <SandboxFolder>C:\Reference\Director8Cache</SandboxFolder>
      <ReadOnly>$directorCacheReadOnly</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Reference\Harness\start-director.ps1"</Command>
  </LogonCommand>
</Configuration>
"@

Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
Write-Host "Generated $configPath"
