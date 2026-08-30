[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$originalFolder = Join-Path $projectRoot "reference\originals\files\dvd_rom\games"
$capturesFolder = Join-Path $projectRoot "reference\captures"
$scenariosFolder = Join-Path $projectRoot "reference\scenarios"
$harnessFolder = Join-Path $projectRoot "tools\reference\sandbox"
$toolsFolder = Join-Path $projectRoot ".tools"

if (-not (Test-Path -LiteralPath (Join-Path $originalFolder "Spaced_Penguin.exe"))) {
    throw "The original projector is missing. Run pnpm reference:fetch first."
}

New-Item -ItemType Directory -Force -Path $capturesFolder | Out-Null
New-Item -ItemType Directory -Force -Path $toolsFolder | Out-Null

$escapedOriginal = [Security.SecurityElement]::Escape($originalFolder)
$escapedCaptures = [Security.SecurityElement]::Escape($capturesFolder)
$escapedScenarios = [Security.SecurityElement]::Escape($scenariosFolder)
$escapedHarness = [Security.SecurityElement]::Escape($harnessFolder)
$configPath = Join-Path $toolsFolder "spaced-penguin-reference.wsb"
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
      <HostFolder>$escapedOriginal</HostFolder>
      <SandboxFolder>C:\Reference\Original</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedCaptures</HostFolder>
      <SandboxFolder>C:\Reference\Captures</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedScenarios</HostFolder>
      <SandboxFolder>C:\Reference\Scenarios</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedHarness</HostFolder>
      <SandboxFolder>C:\Reference\Harness</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Reference\Harness\launch-and-capture.ps1"</Command>
  </LogonCommand>
</Configuration>
"@

Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
Write-Host "Generated $configPath"
Write-Host "Open this file after Windows Sandbox has been enabled."
