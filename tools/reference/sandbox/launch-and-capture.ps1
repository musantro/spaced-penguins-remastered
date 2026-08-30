[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$gamePath = "C:\Reference\Original\Spaced_Penguin.exe"
$capturesPath = "C:\Reference\Captures"
$scenarioPath = "C:\Reference\Scenarios\001-level-01-max-stretch-to-ship.json"
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$statusPath = Join-Path $capturesPath "boot-$runId.json"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class SpacedPenguinNativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr window, ref Point point);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
"@

function Save-ScreenRegion {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$ScreenX,
        [Parameter(Mandatory = $true)][int]$ScreenY,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height
    )

    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($ScreenX, $ScreenY, 0, 0, $bitmap.Size, [Drawing.CopyPixelOperation]::SourceCopy)
        }
        finally {
            $graphics.Dispose()
        }
        $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $bitmap.Dispose()
    }
}

function New-ScreenRegionBitmap {
    param(
        [Parameter(Mandatory = $true)][int]$ScreenX,
        [Parameter(Mandatory = $true)][int]$ScreenY,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height
    )

    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($ScreenX, $ScreenY, 0, 0, $bitmap.Size, [Drawing.CopyPixelOperation]::SourceCopy)
    }
    finally {
        $graphics.Dispose()
    }
    return $bitmap
}

function Invoke-StageClick {
    param(
        [Parameter(Mandatory = $true)][int]$StageScreenX,
        [Parameter(Mandatory = $true)][int]$StageScreenY,
        [Parameter(Mandatory = $true)][int]$LogicalX,
        [Parameter(Mandatory = $true)][int]$LogicalY
    )

    [SpacedPenguinNativeMethods]::SetCursorPos($StageScreenX + $LogicalX, $StageScreenY + $LogicalY) | Out-Null
    Start-Sleep -Milliseconds 100
    [SpacedPenguinNativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 50
    [SpacedPenguinNativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

function Invoke-StageDrag {
    param(
        [Parameter(Mandatory = $true)][int]$StageScreenX,
        [Parameter(Mandatory = $true)][int]$StageScreenY,
        [Parameter(Mandatory = $true)][int]$StartLogicalX,
        [Parameter(Mandatory = $true)][int]$StartLogicalY,
        [Parameter(Mandatory = $true)][int]$EndLogicalX,
        [Parameter(Mandatory = $true)][int]$EndLogicalY,
        [Parameter(Mandatory = $true)][int]$MouseDownHoldMilliseconds,
        [Parameter(Mandatory = $true)][int]$PullHoldMilliseconds
    )

    [SpacedPenguinNativeMethods]::SetCursorPos(
        $StageScreenX + $StartLogicalX,
        $StageScreenY + $StartLogicalY
    ) | Out-Null
    Start-Sleep -Milliseconds 100
    [SpacedPenguinNativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds $MouseDownHoldMilliseconds
    [SpacedPenguinNativeMethods]::SetCursorPos(
        $StageScreenX + $EndLogicalX,
        $StageScreenY + $EndLogicalY
    ) | Out-Null
    Start-Sleep -Milliseconds $PullHoldMilliseconds
}

try {
    if (-not (Test-Path -LiteralPath $gamePath)) {
        throw "Original projector is not available at $gamePath."
    }
    if (-not (Test-Path -LiteralPath $scenarioPath)) {
        throw "Reference scenario is not available at $scenarioPath."
    }

    $scenario = Get-Content -Raw -LiteralPath $scenarioPath | ConvertFrom-Json
    $stageWidth = [int]$scenario.stage.width
    $stageHeight = [int]$scenario.stage.height

    New-Item -ItemType Directory -Force -Path $capturesPath | Out-Null
    $game = Start-Process -FilePath $gamePath -WorkingDirectory (Split-Path $gamePath) -PassThru

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 250
        $game.Refresh()
    } while ($game.MainWindowHandle -eq [IntPtr]::Zero -and -not $game.HasExited -and [DateTime]::UtcNow -lt $deadline)

    if ($game.HasExited) {
        throw "Original projector exited before creating a window (exit code $($game.ExitCode))."
    }
    if ($game.MainWindowHandle -eq [IntPtr]::Zero) {
        throw "Timed out waiting for the original projector window."
    }

    [SpacedPenguinNativeMethods]::SetForegroundWindow($game.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds ([int]$scenario.boot.settleMilliseconds)
    $game.Refresh()

    $clientRect = New-Object SpacedPenguinNativeMethods+Rect
    if (-not [SpacedPenguinNativeMethods]::GetClientRect($game.MainWindowHandle, [ref]$clientRect)) {
        throw "Could not read the projector client rectangle."
    }

    $origin = New-Object SpacedPenguinNativeMethods+Point
    $origin.X = 0
    $origin.Y = 0
    if (-not [SpacedPenguinNativeMethods]::ClientToScreen($game.MainWindowHandle, [ref]$origin)) {
        throw "Could not convert the projector client origin to screen coordinates."
    }

    $width = $clientRect.Right - $clientRect.Left
    $height = $clientRect.Bottom - $clientRect.Top
    if ($width -lt 1 -or $height -lt 1) {
        throw "Invalid projector client size: ${width}x${height}."
    }

    if ($width -lt $stageWidth -or $height -lt $stageHeight) {
        throw "Projector client is smaller than the ${stageWidth}x${stageHeight} Director stage: ${width}x${height}."
    }

    $stageOffsetX = [int][Math]::Floor(($width - $stageWidth) / 2)
    $stageOffsetY = [int][Math]::Floor(($height - $stageHeight) / 2)
    $stageScreenX = $origin.X + $stageOffsetX
    $stageScreenY = $origin.Y + $stageOffsetY

    $bootFullPath = Join-Path $capturesPath "boot-$runId-full.png"
    $bootStagePath = Join-Path $capturesPath "boot-$runId-stage.png"
    Save-ScreenRegion -Path $bootFullPath -ScreenX $origin.X -ScreenY $origin.Y -Width $width -Height $height
    Save-ScreenRegion -Path $bootStagePath -ScreenX $stageScreenX -ScreenY $stageScreenY -Width $stageWidth -Height $stageHeight

    Invoke-StageClick `
        -StageScreenX $stageScreenX `
        -StageScreenY $stageScreenY `
        -LogicalX ([int]$scenario.boot.startButton.x) `
        -LogicalY ([int]$scenario.boot.startButton.y)
    Start-Sleep -Milliseconds ([int]$scenario.boot.levelSettleMilliseconds)
    $levelOneStagePath = Join-Path $capturesPath "level-1-$runId-stage.png"
    Save-ScreenRegion -Path $levelOneStagePath -ScreenX $stageScreenX -ScreenY $stageScreenY -Width $stageWidth -Height $stageHeight

    # Canonical black-box scenario 001. Kevin starts at logical (413, 303)
    # and is pulled just beyond the 100 px sling limit. Director clamps the
    # final point while retaining the requested direction.
    $dragStartX = [int]$scenario.input.dragStart.x
    $dragStartY = [int]$scenario.input.dragStart.y
    $dragEndX = [int]$scenario.input.dragEnd.x
    $dragEndY = [int]$scenario.input.dragEnd.y
    $mouseDownHoldMilliseconds = [int]$scenario.input.mouseDownHoldMilliseconds
    $pullHoldMilliseconds = [int]$scenario.input.pullHoldMilliseconds
    $sampleRate = [int]$scenario.sampling.requestedRateHz
    $sampleCount = [int]$scenario.sampling.requestedCount
    $trajectoryDirectoryName = "trajectory-001-$runId"
    $trajectoryPath = Join-Path $capturesPath $trajectoryDirectoryName
    New-Item -ItemType Directory -Force -Path $trajectoryPath | Out-Null

    [SpacedPenguinNativeMethods]::SetForegroundWindow($game.MainWindowHandle) | Out-Null
    Invoke-StageDrag `
        -StageScreenX $stageScreenX `
        -StageScreenY $stageScreenY `
        -StartLogicalX $dragStartX `
        -StartLogicalY $dragStartY `
        -EndLogicalX $dragEndX `
        -EndLogicalY $dragEndY `
        -MouseDownHoldMilliseconds $mouseDownHoldMilliseconds `
        -PullHoldMilliseconds $pullHoldMilliseconds

    $pullbackPath = Join-Path $trajectoryPath "pullback.png"
    Save-ScreenRegion -Path $pullbackPath -ScreenX $stageScreenX -ScreenY $stageScreenY -Width $stageWidth -Height $stageHeight

    $capturedFrames = New-Object 'System.Collections.Generic.List[System.Drawing.Bitmap]'
    $sampleRows = New-Object 'System.Collections.Generic.List[object]'
    $sampleClock = [Diagnostics.Stopwatch]::StartNew()
    [SpacedPenguinNativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    $releaseAtMilliseconds = $sampleClock.Elapsed.TotalMilliseconds

    try {
        for ($sampleIndex = 0; $sampleIndex -lt $sampleCount; $sampleIndex++) {
            $targetMilliseconds = $sampleIndex * 1000.0 / $sampleRate
            while ($sampleClock.Elapsed.TotalMilliseconds -lt $targetMilliseconds) {
                $remainingMilliseconds = $targetMilliseconds - $sampleClock.Elapsed.TotalMilliseconds
                if ($remainingMilliseconds -gt 2.0) {
                    Start-Sleep -Milliseconds ([Math]::Max(1, [int][Math]::Floor($remainingMilliseconds - 1.0)))
                }
            }

            $frame = New-ScreenRegionBitmap -ScreenX $stageScreenX -ScreenY $stageScreenY -Width $stageWidth -Height $stageHeight
            $actualMilliseconds = $sampleClock.Elapsed.TotalMilliseconds
            $capturedFrames.Add($frame)
            $sampleRows.Add([PSCustomObject]@{
                index = $sampleIndex
                targetMilliseconds = [Math]::Round($targetMilliseconds, 3)
                capturedMilliseconds = [Math]::Round($actualMilliseconds, 3)
                latenessMilliseconds = [Math]::Round($actualMilliseconds - $targetMilliseconds, 3)
                file = "frame-{0:D4}.png" -f $sampleIndex
            })
        }
    }
    finally {
        $sampleClock.Stop()
    }

    try {
        for ($sampleIndex = 0; $sampleIndex -lt $capturedFrames.Count; $sampleIndex++) {
            $framePath = Join-Path $trajectoryPath ("frame-{0:D4}.png" -f $sampleIndex)
            $capturedFrames[$sampleIndex].Save($framePath, [Drawing.Imaging.ImageFormat]::Png)
        }
    }
    finally {
        foreach ($capturedFrame in $capturedFrames) {
            $capturedFrame.Dispose()
        }
    }

    $trajectoryMetadataPath = Join-Path $trajectoryPath "trace.json"
    [PSCustomObject]@{
        schemaVersion = 1
        scenario = $scenario.id
        source = "canonical Big Idea projector in Windows Sandbox"
        directorFrameRate = [int]$scenario.movieFrameRate
        stage = [PSCustomObject]@{ width = $stageWidth; height = $stageHeight }
        input = [PSCustomObject]@{
            dragStart = [PSCustomObject]@{ x = $dragStartX; y = $dragStartY }
            dragEnd = [PSCustomObject]@{ x = $dragEndX; y = $dragEndY }
            mouseDownHoldMilliseconds = $mouseDownHoldMilliseconds
            pullHoldMilliseconds = $pullHoldMilliseconds
            releaseAtSampleClockMilliseconds = [Math]::Round($releaseAtMilliseconds, 3)
        }
        sampling = [PSCustomObject]@{
            requestedRateHz = $sampleRate
            requestedCount = $sampleCount
            elapsedMilliseconds = [Math]::Round($sampleRows[$sampleRows.Count - 1].capturedMilliseconds, 3)
            samples = $sampleRows
        }
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $trajectoryMetadataPath -Encoding UTF8

    [PSCustomObject]@{
        status = "captured"
        runId = $runId
        processId = $game.Id
        windowTitle = $game.MainWindowTitle
        clientWidth = $width
        clientHeight = $height
        clientScreenX = $origin.X
        clientScreenY = $origin.Y
        stageOffsetX = $stageOffsetX
        stageOffsetY = $stageOffsetY
        bootFullScreenshot = [IO.Path]::GetFileName($bootFullPath)
        bootStageScreenshot = [IO.Path]::GetFileName($bootStagePath)
        levelOneStageScreenshot = [IO.Path]::GetFileName($levelOneStagePath)
        trajectoryDirectory = $trajectoryDirectoryName
        trajectoryMetadata = [IO.Path]::GetFileName($trajectoryMetadataPath)
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
catch {
    [PSCustomObject]@{
        status = "error"
        runId = $runId
        message = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
