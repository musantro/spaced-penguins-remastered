[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RunDirectory
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$resolvedRunDirectory = (Resolve-Path -LiteralPath $RunDirectory).Path
$runsRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "reference\test-api\runs"))
if (-not $resolvedRunDirectory.StartsWith($runsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RunDirectory must be a child of $runsRoot."
}

$originalsFolder = Join-Path $projectRoot "reference\originals\files"
$instrumentationFolder = Join-Path $projectRoot "reference\instrumentation"
$harnessFolder = Join-Path $projectRoot "tools\reference\sandbox"
$directorCacheFolder = Join-Path $projectRoot ".tools\director8-cache"
$toolsFolder = Join-Path $projectRoot ".tools"
$required = @(
    (Join-Path $originalsFolder "spacedpenguin_bigidea_20020806.dir"),
    (Join-Path $instrumentationFolder "reference_trace.ls"),
    (Join-Path $harnessFolder "run-director-test-api.ps1"),
    (Join-Path $directorCacheFolder "cache-manifest.json"),
    (Join-Path $resolvedRunDirectory "request.json")
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required test API input is missing: $path"
    }
}

New-Item -ItemType Directory -Force -Path $toolsFolder | Out-Null
$escapedOriginals = [Security.SecurityElement]::Escape($originalsFolder)
$escapedInstrumentation = [Security.SecurityElement]::Escape($instrumentationFolder)
$escapedHarness = [Security.SecurityElement]::Escape($harnessFolder)
$escapedDirectorCache = [Security.SecurityElement]::Escape($directorCacheFolder)
$escapedRun = [Security.SecurityElement]::Escape($resolvedRunDirectory)
$configPath = Join-Path $toolsFolder "spaced-penguin-test-api.wsb"
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
      <HostFolder>$escapedDirectorCache</HostFolder>
      <SandboxFolder>C:\Reference\Director8Cache</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedRun</HostFolder>
      <SandboxFolder>C:\Reference\Run</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Reference\Harness\run-director-test-api.ps1"</Command>
  </LogonCommand>
</Configuration>
"@

Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
Write-Output $configPath
