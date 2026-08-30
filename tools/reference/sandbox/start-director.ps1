[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$cacheManifestPath = "C:\Reference\Director8Cache\cache-manifest.json"
$harnessPath = "C:\Reference\Harness"

if (Test-Path -LiteralPath $cacheManifestPath) {
    & (Join-Path $harnessPath "launch-cached-director.ps1")
}
else {
    & (Join-Path $harnessPath "install-director.ps1")
}
