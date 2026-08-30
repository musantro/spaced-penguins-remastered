[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$cachePath = "C:\Reference\Director8Cache"
$manifestPath = Join-Path $cachePath "cache-manifest.json"
$sourceDirPath = "C:\Reference\Originals\spacedpenguin_bigidea_20020806.dir"
$runPath = "C:\Reference\Run"
$requestPath = Join-Path $runPath "request.json"
$resultPath = Join-Path $runPath "result.json"
$workingDirPath = Join-Path $runPath "working.dir"
$rawTracePath = Join-Path $runPath "raw-trace.tsv"
$captureCompletePath = Join-Path $runPath "capture-complete.txt"
$movieStartedPath = Join-Path $runPath "movie-started.txt"
$commandReadyPath = Join-Path $runPath "command-ready.txt"
$sourceCountPath = Join-Path $runPath "source-count.txt"
$expectedInstallerSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DirectorTestApiNativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Point { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

    public sealed class WindowRecord
    {
        public long Handle { get; set; }
        public long ParentHandle { get; set; }
        public long ActualParentHandle { get; set; }
        public string ClassName { get; set; }
        public string Text { get; set; }
        public bool Visible { get; set; }
        public int Left { get; set; }
        public int Top { get; set; }
        public int Right { get; set; }
        public int Bottom { get; set; }
    }

    public sealed class MenuRecord
    {
        public string Path { get; set; }
        public string Text { get; set; }
        public long CommandId { get; set; }
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rectangle);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr SetActiveWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr SetFocus(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetMenu(IntPtr window);
    [DllImport("user32.dll")] private static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] private static extern IntPtr GetSubMenu(IntPtr menu, int position);
    [DllImport("user32.dll")] private static extern uint GetMenuItemID(IntPtr menu, int position);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int maximum, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static WindowRecord[] Snapshot(int wantedProcessId)
    {
        var result = new List<WindowRecord>();
        EnumWindows(delegate(IntPtr topWindow, IntPtr ignored)
        {
            uint processId;
            GetWindowThreadProcessId(topWindow, out processId);
            if (processId != wantedProcessId) return true;
            AddRecord(result, topWindow, IntPtr.Zero);
            EnumChildWindows(topWindow, delegate(IntPtr childWindow, IntPtr childIgnored)
            {
                uint childProcessId;
                GetWindowThreadProcessId(childWindow, out childProcessId);
                if (childProcessId == wantedProcessId) AddRecord(result, childWindow, topWindow);
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static MenuRecord[] SnapshotMenu(IntPtr window)
    {
        var result = new List<MenuRecord>();
        WalkMenu(GetMenu(window), "", result);
        return result.ToArray();
    }

    public static void InvokeMenuItem(IntPtr window, long commandId)
    {
        SendMessage(window, 0x0111, new IntPtr(commandId), IntPtr.Zero);
    }

    public static void ActivateChildWindow(IntPtr window)
    {
        const uint WM_MDIACTIVATE = 0x0222;
        var mdiChild = window;
        var parent = GetParent(window);
        var firstParent = parent;
        while (parent != IntPtr.Zero)
        {
            var className = new StringBuilder(512);
            GetClassName(parent, className, className.Capacity);
            if (String.Equals(className.ToString(), "MDIClient", StringComparison.Ordinal))
            {
                SendMessage(parent, WM_MDIACTIVATE, IntPtr.Zero, mdiChild);
                BringWindowToTop(mdiChild);
                break;
            }
            mdiChild = parent;
            parent = GetParent(parent);
        }
        if (firstParent != IntPtr.Zero)
        {
            BringWindowToTop(firstParent);
            SetActiveWindow(firstParent);
        }
        BringWindowToTop(window);
        SetFocus(window);
    }

    public static bool IsChildSurfaceUnoccluded(IntPtr surface)
    {
        const uint GW_HWNDPREV = 3;
        var container = GetParent(surface);
        if (container == IntPtr.Zero) return false;
        Rect surfaceRectangle;
        if (!GetWindowRect(surface, out surfaceRectangle)) return false;
        var sibling = GetWindow(container, GW_HWNDPREV);
        while (sibling != IntPtr.Zero)
        {
            Rect siblingRectangle;
            if (IsWindowVisible(sibling) && GetWindowRect(sibling, out siblingRectangle) &&
                siblingRectangle.Left < surfaceRectangle.Right && siblingRectangle.Right > surfaceRectangle.Left &&
                siblingRectangle.Top < surfaceRectangle.Bottom && siblingRectangle.Bottom > surfaceRectangle.Top)
            {
                return false;
            }
            sibling = GetWindow(sibling, GW_HWNDPREV);
        }
        return true;
    }

    private static void WalkMenu(IntPtr menu, string parentPath, List<MenuRecord> result)
    {
        const uint MF_BYPOSITION = 0x00000400;
        var count = GetMenuItemCount(menu);
        for (var position = 0; position < count; position++)
        {
            var text = new StringBuilder(1024);
            GetMenuString(menu, (uint)position, text, text.Capacity, MF_BYPOSITION);
            var itemText = text.ToString();
            var path = String.IsNullOrEmpty(parentPath) ? itemText : parentPath + " > " + itemText;
            var subMenu = GetSubMenu(menu, position);
            var commandId = GetMenuItemID(menu, position);
            result.Add(new MenuRecord { Path = path, Text = itemText, CommandId = commandId });
            if (subMenu != IntPtr.Zero) WalkMenu(subMenu, path, result);
        }
    }

    private static void AddRecord(List<WindowRecord> result, IntPtr window, IntPtr parent)
    {
        var title = new StringBuilder(4096);
        var className = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        GetClassName(window, className, className.Capacity);
        Rect rectangle;
        GetWindowRect(window, out rectangle);
        result.Add(new WindowRecord
        {
            Handle = window.ToInt64(), ParentHandle = parent.ToInt64(),
            ActualParentHandle = GetParent(window).ToInt64(),
            ClassName = className.ToString(), Text = title.ToString(),
            Visible = IsWindowVisible(window), Left = rectangle.Left, Top = rectangle.Top,
            Right = rectangle.Right, Bottom = rectangle.Bottom
        });
    }
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

function Restore-DirectorCache {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "Director cache manifest is missing."
    }
    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.installerSha256 -ne $expectedInstallerSha256) {
        throw "Director cache manifest is not compatible with the test API."
    }
    $rootPaths = Get-RootPaths
    foreach ($directory in $manifest.directories) {
        $rootPath = $rootPaths[$directory.root]
        if (-not $rootPath) { throw "Unknown cache root '$($directory.root)'." }
        $source = Join-Path (Join-Path (Join-Path $cachePath "payload") $directory.root) $directory.relativePath
        $destination = Join-Path $rootPath $directory.relativePath
        New-Item -ItemType Directory -Force -Path $destination | Out-Null
        Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
    }
    foreach ($registryFile in $manifest.registryFiles) {
        $registryPath = Join-Path (Join-Path $cachePath "payload\Registry") $registryFile
        $import = Start-Process -FilePath reg.exe -ArgumentList @("import", ('"{0}"' -f $registryPath)) -WindowStyle Hidden -Wait -PassThru
        if ($import.ExitCode -ne 0) { throw "Could not restore Director registry file $registryFile." }
    }
    $directorRoot = $rootPaths[$manifest.director.root]
    $directorPath = Join-Path $directorRoot $manifest.director.relativePath
    if (-not (Test-Path -LiteralPath $directorPath)) { throw "Director.exe was not restored." }
    return $directorPath
}

function ConvertTo-LingoStringExpression {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
    if ($Value.Length -eq 0) { return "EMPTY" }
    $parts = $Value -split '"', -1
    $expressions = for ($index = 0; $index -lt $parts.Count; $index++) {
        if ($index -gt 0) { "QUOTE" }
        if ($parts[$index].Length -gt 0) { '"' + $parts[$index] + '"' }
    }
    return "(" + ($expressions -join " & ") + ")"
}

function ConvertTo-LingoSourceChunks {
    param([Parameter(Mandatory = $true)][string]$Source)
    $lines = $Source -split "`r?`n"
    $result = New-Object 'System.Collections.Generic.List[string]'
    for ($offset = 0; $offset -lt $lines.Count; $offset += 10) {
        $last = [Math]::Min($offset + 9, $lines.Count - 1)
        $parts = for ($index = $offset; $index -le $last; $index++) {
            ConvertTo-LingoStringExpression -Value $lines[$index]
        }
        $result.Add("(" + ($parts -join " & RETURN & ") + ")")
    }
    return $result
}

function Send-DirectorCommand {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$Command
    )
    $Process.Refresh()
    [DirectorTestApiNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 75
    [Windows.Forms.Clipboard]::SetText($Command)
    # Director 8 occasionally leaves an unexecuted fragment in the Message
    # command field. Select it explicitly so every command is an atomic replace.
    [Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 50
    [Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 50
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 180
    $windows = [DirectorTestApiNativeMethods]::Snapshot($Process.Id)
    $dialog = $windows | Where-Object {
        $_.Visible -and $_.ParentHandle -eq 0 -and $_.ClassName -eq "#32770"
    } | Select-Object -First 1
    if ($dialog) {
        $text = $windows | Where-Object {
            $_.ParentHandle -eq $dialog.Handle -and $_.ClassName -eq "Static" -and $_.Text
        } | Sort-Object { $_.Text.Length } -Descending | Select-Object -ExpandProperty Text -First 1
        throw "Director rejected Message command: $text. Command: $Command"
    }
}

function Get-DirectorSourceCount {
    param([Parameter(Mandatory = $true)][Diagnostics.Process]$Process)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if (Test-Path -LiteralPath $sourceCountPath) { Remove-Item -LiteralPath $sourceCountPath -Force }
        Send-DirectorCommand -Process $Process -Command 'the traceLogFile = "C:/Reference/Run/source-count.txt"'
        Send-DirectorCommand -Process $Process -Command 'put gReferenceSource.char.count'
        Send-DirectorCommand -Process $Process -Command 'the traceLogFile = EMPTY'
        $deadline = [DateTime]::UtcNow.AddSeconds(2)
        while (-not (Test-Path -LiteralPath $sourceCountPath) -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds 50
        }
        if (Test-Path -LiteralPath $sourceCountPath) {
            $text = Get-Content -Raw -LiteralPath $sourceCountPath
            $match = [regex]::Match($text, '(\d+)')
            if ($match.Success) { return [int]$match.Groups[1].Value }
        }
    }
    return -1
}

function Invoke-Menu {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][object[]]$Menu,
        [Parameter(Mandatory = $true)][string]$TextPattern,
        [string]$PathPattern = "*"
    )
    $item = $Menu | Where-Object {
        $_.Path -like $PathPattern -and (($_.Text -replace "&", "") -like $TextPattern) -and $_.CommandId -ge 0
    } | Select-Object -First 1
    if (-not $item) { throw "Director menu item not found: $PathPattern / $TextPattern" }
    [DirectorTestApiNativeMethods]::InvokeMenuItem($Process.MainWindowHandle, $item.CommandId)
    Start-Sleep -Milliseconds 350
}

function ConvertTo-InvariantNumber {
    param($Value, [double]$Default = 0)
    if ($null -eq $Value) { $Value = $Default }
    return [Convert]::ToString([double]$Value, [Globalization.CultureInfo]::InvariantCulture)
}

function ConvertTo-LingoSymbol {
    param($Value, [string]$Default = "0")
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value) -or $Value -eq 0) { return $Default }
    $text = ([string]$Value).TrimStart("#")
    if ($text -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") { throw "Unsafe Lingo symbol in snapshot: $Value" }
    return "#$text"
}

function Get-TraceSample {
    if (-not (Test-Path -LiteralPath $rawTracePath)) { return -1 }
    $lineCount = @(Get-Content -LiteralPath $rawTracePath).Count
    return [Math]::Max(-1, $lineCount - 2)
}

function Save-StageScreenshot {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][object[]]$Menu,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $Process.Refresh()
    [DirectorTestApiNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
    $windows = [DirectorTestApiNativeMethods]::Snapshot($Process.Id)
    $stageWindow = $windows | Where-Object {
        $_.Visible -and $_.ClassName -eq "ImlWinCls" -and
        ($_.Right - $_.Left) -eq 500 -and ($_.Bottom - $_.Top) -eq 400
    } | Select-Object -First 1
    if (-not $stageWindow) {
        Invoke-Menu -Process $Process -Menu $Menu -TextPattern "Stage*" -PathPattern "*Window*"
    }
    $shownDeadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        Start-Sleep -Milliseconds 50
        $windows = [DirectorTestApiNativeMethods]::Snapshot($Process.Id)
        $stageWindow = $windows | Where-Object {
            $_.Visible -and $_.ClassName -eq "ImlWinCls" -and
            ($_.Right - $_.Left) -eq 500 -and ($_.Bottom - $_.Top) -eq 400
        } | Select-Object -First 1
    } while (-not $stageWindow -and [DateTime]::UtcNow -lt $shownDeadline)
    if (-not $stageWindow) {
        $windows | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runPath "stage-window-diagnostics.json") -Encoding UTF8
        $Menu | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runPath "director-menu-diagnostics.json") -Encoding UTF8
        throw "Could not locate Director's exact 500 by 400 ImlWinCls Stage surface."
    }

    $handle = [IntPtr]$stageWindow.Handle
    # SetForegroundWindow does not alter the z-order of an MDI child. Director
    # can leave the 500x400 Stage behind Score/Cast windows, which would make a
    # screen copy contain the IDE even though its dimensions look correct.
    [DirectorTestApiNativeMethods]::ActivateChildWindow($handle)
    Start-Sleep -Milliseconds 100
    if (-not [DirectorTestApiNativeMethods]::IsChildSurfaceUnoccluded($handle)) {
        throw "Director Stage is still occluded by another authoring window."
    }
    $clientRect = New-Object DirectorTestApiNativeMethods+Rect
    $origin = New-Object DirectorTestApiNativeMethods+Point
    if (-not [DirectorTestApiNativeMethods]::GetClientRect($handle, [ref]$clientRect)) {
        throw "Could not read the Stage client rectangle."
    }
    if (-not [DirectorTestApiNativeMethods]::ClientToScreen($handle, [ref]$origin)) {
        throw "Could not locate the Stage on screen."
    }
    $width = $clientRect.Right - $clientRect.Left
    $height = $clientRect.Bottom - $clientRect.Top
    if ($width -lt 500 -or $height -lt 400) { throw "Director Stage client is only ${width}x${height}." }
    $screenX = $origin.X + [int][Math]::Floor(($width - 500) / 2)
    $screenY = $origin.Y + [int][Math]::Floor(($height - 400) / 2)
    $bitmap = New-Object Drawing.Bitmap(500, 400, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($screenX, $screenY, 0, 0, $bitmap.Size, [Drawing.CopyPixelOperation]::SourceCopy)
        }
        finally { $graphics.Dispose() }
        $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    }
    finally { $bitmap.Dispose() }
}

function Restore-RequestedState {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)]$Snapshot
    )
    $score = ConvertTo-InvariantNumber $Snapshot.game.score
    $highScore = ConvertTo-InvariantNumber $Snapshot.game.highScore ([double]$Snapshot.game.score)
    $alert = ConvertTo-LingoSymbol $Snapshot.game.alert
    Send-DirectorCommand -Process $Process -Command "referenceSetGameState($score, $highScore, $alert)"

    if ($Snapshot.gps) {
        $state = ConvertTo-LingoSymbol $Snapshot.gps.state "#iddle"
        $arguments = @(
            $state,
            (ConvertTo-InvariantNumber $Snapshot.gps.point.x),
            (ConvertTo-InvariantNumber $Snapshot.gps.point.y),
            (ConvertTo-InvariantNumber $Snapshot.gps.velocity.x),
            (ConvertTo-InvariantNumber $Snapshot.gps.velocity.y),
            (ConvertTo-InvariantNumber $Snapshot.gps.frameCount),
            (ConvertTo-InvariantNumber $Snapshot.gps.tries),
            (ConvertTo-InvariantNumber $Snapshot.gps.distance)
        )
        Send-DirectorCommand -Process $Process -Command ("referenceRestoreGPS(" + ($arguments -join ", ") + ")")
    }
    foreach ($planet in @($Snapshot.planets)) {
        $orbit = $planet.orbit
        $arguments = @(
            [int]$planet.channel,
            (ConvertTo-InvariantNumber $planet.point.x),
            (ConvertTo-InvariantNumber $planet.point.y),
            (ConvertTo-InvariantNumber $orbit.velocity.x),
            (ConvertTo-InvariantNumber $orbit.velocity.y),
            (ConvertTo-InvariantNumber $orbit.floatPoint.x $planet.point.x),
            (ConvertTo-InvariantNumber $orbit.floatPoint.y $planet.point.y)
        )
        Send-DirectorCommand -Process $Process -Command ("referenceRestorePlanet(" + ($arguments -join ", ") + ")")
    }
    foreach ($bonus in @($Snapshot.bonuses)) {
        $arguments = @(
            [int]$bonus.channel,
            (ConvertTo-LingoSymbol $bonus.state "#notHit"),
            [int]$bonus.memberNum,
            (ConvertTo-InvariantNumber $bonus.rotation),
            (ConvertTo-InvariantNumber $bonus.rotationVelocity 3)
        )
        Send-DirectorCommand -Process $Process -Command ("referenceRestoreBonus(" + ($arguments -join ", ") + ")")
    }
}

function Write-AtomicResult {
    param([Parameter(Mandatory = $true)][object]$Value)
    $pendingPath = Join-Path $runPath "result.pending.json"
    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pendingPath -Encoding UTF8
    Move-Item -LiteralPath $pendingPath -Destination $resultPath -Force
}

function Remove-CaptureOutputs {
    foreach ($path in @($rawTracePath, $captureCompletePath, $movieStartedPath, $commandReadyPath)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
}

function Set-DirectorTarget {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][object]$Target
    )
    if ($Target.kind -eq "level") {
        $level = [int]$Target.level
        Send-DirectorCommand -Process $Process -Command ("go " + (10 + $level))
    }
    elseif ($Target.kind -eq "frame") {
        Send-DirectorCommand -Process $Process -Command ("go " + [int]$Target.frame)
    }
    else {
        $labelExpression = ConvertTo-LingoStringExpression -Value ([string]$Target.label)
        Send-DirectorCommand -Process $Process -Command "go($labelExpression)"
    }
}

function Invoke-ScoreInventory {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][object]$Request
    )
    $entries = New-Object 'System.Collections.Generic.List[object]'
    foreach ($entry in @($Request.targets)) {
        $exported = $false
        for ($attempt = 1; $attempt -le 3 -and -not $exported; $attempt++) {
            if (Test-Path -LiteralPath $commandReadyPath) { Remove-Item -LiteralPath $commandReadyPath -Force }
            $scoreFileName = "score-$($entry.id).tsv"
            $scorePath = Join-Path $runPath $scoreFileName
            if (Test-Path -LiteralPath $scorePath) { Remove-Item -LiteralPath $scorePath -Force }
            Send-DirectorCommand -Process $Process -Command "go 1"
            Send-DirectorCommand -Process $Process -Command "prepareMovie()"
            Set-DirectorTarget -Process $Process -Target $entry.target
            Send-DirectorCommand -Process $Process -Command ('referenceConfirmTarget("' + $entry.id + '")')
            $readyDeadline = [DateTime]::UtcNow.AddSeconds(3)
            while (-not (Test-Path -LiteralPath $commandReadyPath) -and [DateTime]::UtcNow -lt $readyDeadline) {
                Start-Sleep -Milliseconds 50
            }
            if (-not (Test-Path -LiteralPath $commandReadyPath)) { continue }
            $readyLine = ((Get-Content -Raw -LiteralPath $commandReadyPath).Trim() -replace '^--\s*"', '') -replace '"$', ''
            $readyFields = $readyLine -split "`t"
            if ($readyFields[0] -ne [string]$entry.id) { continue }
            Send-DirectorCommand -Process $Process -Command ('referenceExportScoreFrame("' + $entry.id + '")')
            $scoreDeadline = [DateTime]::UtcNow.AddSeconds(3)
            while (-not (Test-Path -LiteralPath $scorePath) -and [DateTime]::UtcNow -lt $scoreDeadline) {
                Start-Sleep -Milliseconds 50
            }
            $exported = Test-Path -LiteralPath $scorePath
        }
        if (-not $exported) { throw "Director did not export Score target $($entry.id) after three attempts." }
        $entries.Add([PSCustomObject]@{
            id = [string]$entry.id
            score = $scoreFileName
            acknowledgedFrame = [int]$readyFields[1]
            acknowledgedFrameLabel = [string]$readyFields[2]
        })
    }
    return $entries
}

function Invoke-VerificationMatrix {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][object[]]$Menu,
        [Parameter(Mandatory = $true)][object]$Request
    )
    $entries = New-Object 'System.Collections.Generic.List[object]'
    foreach ($verification in @($Request.targets)) {
        $captured = $false
        $acknowledgedFrame = 0
        $acknowledgedFrameLabel = ""
        $entryScreenshotName = $null
        for ($attempt = 1; $attempt -le 3 -and -not $captured; $attempt++) {
            Remove-CaptureOutputs
            # Stop/Play does not rerun Director's prepareMovie handler. Return
            # to a non-game frame and invoke it explicitly so state cannot leak.
            Send-DirectorCommand -Process $Process -Command "go 1"
            Send-DirectorCommand -Process $Process -Command "prepareMovie()"
            $targetLevel = 0
            if ($verification.target.kind -eq "level") { $targetLevel = [int]$verification.target.level }
            if ($verification.target.kind -eq "level") {
                $expectedConfig = "test-api-physics|polar|100|-137|1|$targetLevel"
            }
            else {
                $expectedConfig = "test-api-state|0|0"
            }
            Send-DirectorCommand -Process $Process -Command ('member("Reference Trace").comments = "' + $expectedConfig + '"')
            Set-DirectorTarget -Process $Process -Target $verification.target
            Send-DirectorCommand -Process $Process -Command ('referenceConfirmTarget("' + $verification.id + '")')
            $readyDeadline = [DateTime]::UtcNow.AddSeconds(3)
            while (-not (Test-Path -LiteralPath $commandReadyPath) -and [DateTime]::UtcNow -lt $readyDeadline) {
                Start-Sleep -Milliseconds 50
            }
            $readyText = ""
            if (Test-Path -LiteralPath $commandReadyPath) { $readyText = Get-Content -Raw -LiteralPath $commandReadyPath }
            $readyMatches = $readyText -match [regex]::Escape([string]$verification.id) -and
                $readyText -match [regex]::Escape($expectedConfig)
            if ($verification.target.kind -eq "level") {
                $readyMatches = $readyMatches -and $readyText -match ("\t" + (10 + [int]$verification.target.level) + "\t")
            }
            elseif ($verification.target.kind -eq "frame") {
                $readyMatches = $readyMatches -and $readyText -match ("\t" + [int]$verification.target.frame + "\t")
            }
            else {
                $readyMatches = $readyMatches -and $readyText -match ("\t" + [regex]::Escape([string]$verification.target.label) + "\t")
            }
            if (-not $readyMatches) { continue }
            $readyLine = ($readyText.Trim() -replace '^--\s*"', '') -replace '"$', ''
            $readyFields = $readyLine -split "`t"
            $acknowledgedFrame = [int]$readyFields[1]
            $acknowledgedFrameLabel = [string]$readyFields[2]
            $scoreFileName = "score-$($verification.id).tsv"
            Send-DirectorCommand -Process $Process -Command ('referenceExportScoreFrame("' + $verification.id + '")')
            $scoreDeadline = [DateTime]::UtcNow.AddSeconds(3)
            $scorePath = Join-Path $runPath $scoreFileName
            while (-not (Test-Path -LiteralPath $scorePath) -and [DateTime]::UtcNow -lt $scoreDeadline) {
                Start-Sleep -Milliseconds 50
            }
            if (-not (Test-Path -LiteralPath $scorePath)) { continue }
            if ($verification.target.kind -eq "screen") {
                $entryScreenshotName = "stage-entry-$($verification.id).png"
                Save-StageScreenshot -Process $Process -Menu $Menu -Path (Join-Path $runPath $entryScreenshotName)
            }

            [DirectorTestApiNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
            [Windows.Forms.SendKeys]::SendWait("^m")
            Start-Sleep -Milliseconds 250
            Invoke-Menu -Process $Process -Menu $Menu -TextPattern "Play*" -PathPattern "*Control*"
            $captureDeadline = [DateTime]::UtcNow.AddSeconds(10)
            while (-not (Test-Path -LiteralPath $captureCompletePath) -and [DateTime]::UtcNow -lt $captureDeadline) {
                Start-Sleep -Milliseconds 20
            }
            $captured = (Test-Path -LiteralPath $movieStartedPath) -and (Test-Path -LiteralPath $captureCompletePath)
            if (-not $captured) {
                Invoke-Menu -Process $Process -Menu $Menu -TextPattern "Stop*" -PathPattern "*Control*"
                [DirectorTestApiNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
                [Windows.Forms.SendKeys]::SendWait("^m")
                Start-Sleep -Milliseconds 250
            }
        }
        if (-not $captured) { throw "Director did not capture verification target $($verification.id) after three acknowledged attempts." }

        $observedSample = Get-TraceSample
        $requestedSample = 0
        if ($verification.target.kind -eq "level") { $requestedSample = 1 }
        $screenshotName = "stage-$($verification.id).png"
        Save-StageScreenshot -Process $Process -Menu $Menu -Path (Join-Path $runPath $screenshotName)
        Invoke-Menu -Process $Process -Menu $Menu -TextPattern "Stop*" -PathPattern "*Control*"
        Start-Sleep -Milliseconds 150
        $rawTraceName = "raw-$($verification.id).tsv"
        Move-Item -LiteralPath $rawTracePath -Destination (Join-Path $runPath $rawTraceName) -Force
        $entries.Add([PSCustomObject]@{
            id = [string]$verification.id
            rawTrace = $rawTraceName
            screenshot = $screenshotName
            entryScreenshot = $entryScreenshotName
            acknowledgedFrame = $acknowledgedFrame
            acknowledgedFrameLabel = $acknowledgedFrameLabel
            requestedSample = $requestedSample
            observedSample = $observedSample
            score = $scoreFileName
        })

        [DirectorTestApiNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
        [Windows.Forms.SendKeys]::SendWait("^m")
        Start-Sleep -Milliseconds 250
    }
    return $entries
}

$director = $null
try {
    foreach ($path in @($manifestPath, $sourceDirPath, $requestPath, "C:\Reference\Instrumentation\reference_trace.ls")) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Required input is missing: $path" }
    }
    $request = Get-Content -Raw -LiteralPath $requestPath | ConvertFrom-Json
    $directorPath = Restore-DirectorCache
    Copy-Item -LiteralPath $sourceDirPath -Destination $workingDirPath -Force
    foreach ($path in @($rawTracePath, $captureCompletePath, $movieStartedPath, (Join-Path $runPath "movie-labels.txt"))) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }

    $launchStartedAt = Get-Date
    $launcher = Start-Process -FilePath $directorPath -ArgumentList ('"{0}"' -f $workingDirPath) -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 250
        $director = Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.StartTime -ge $launchStartedAt.AddSeconds(-2) -and $_.MainWindowHandle -ne [IntPtr]::Zero -and
            ($_.MainWindowTitle -match "(^| - )Director 8$")
        } | Sort-Object StartTime -Descending | Select-Object -First 1
    } while (-not $director -and [DateTime]::UtcNow -lt $deadline)
    if (-not $director) { throw "Director 8 did not create its authoring window." }
    Start-Sleep -Seconds 8
    $director.Refresh()
    [DirectorTestApiNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 1

    $menu = [DirectorTestApiNativeMethods]::SnapshotMenu($director.MainWindowHandle)
    Invoke-Menu -Process $director -Menu $menu -TextPattern "Internal" -PathPattern "*Window*Cast*Internal*"
    [DirectorTestApiNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Milliseconds 500

    Send-DirectorCommand -Process $director -Command 'global gReferenceBootstrapMember'
    Send-DirectorCommand -Process $director -Command 'gReferenceBootstrapMember = new(#script)'
    Send-DirectorCommand -Process $director -Command 'gReferenceBootstrapMember.name = "Reference Trace"'
    Send-DirectorCommand -Process $director -Command 'gReferenceBootstrapMember.scriptType = #movie'
    Send-DirectorCommand -Process $director -Command 'global gReferenceSource'
    $source = Get-Content -Raw -LiteralPath "C:\Reference\Instrumentation\reference_trace.ls"
    $sourceLines = $source -split "`r?`n"
    $expectedSourceCount = (($sourceLines -join "`r").Length)
    $chunks = ConvertTo-LingoSourceChunks -Source $source
    $sourceReady = $false
    for ($sourceAttempt = 1; $sourceAttempt -le 3 -and -not $sourceReady; $sourceAttempt++) {
        Send-DirectorCommand -Process $director -Command 'gReferenceSource = EMPTY'
        for ($index = 0; $index -lt $chunks.Count; $index++) {
            $command = "gReferenceSource = gReferenceSource & "
            if ($index -gt 0) { $command += "RETURN & " }
            $command += $chunks[$index]
            Send-DirectorCommand -Process $director -Command $command
        }
        $actualSourceCount = Get-DirectorSourceCount -Process $director
        $sourceReady = $actualSourceCount -eq $expectedSourceCount
    }
    if (-not $sourceReady) {
        throw "Director source injection was incomplete after three attempts: expected $expectedSourceCount characters, observed $actualSourceCount."
    }
    Send-DirectorCommand -Process $director -Command 'gReferenceBootstrapMember.scriptText = gReferenceSource'
    [DirectorTestApiNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Milliseconds 400
    Invoke-Menu -Process $director -Menu $menu -TextPattern "Recompile All Scripts*" -PathPattern "*Control*"
    $compileWindows = [DirectorTestApiNativeMethods]::Snapshot($director.Id)
    $compileDialog = $compileWindows | Where-Object {
        $_.Visible -and $_.ParentHandle -eq 0 -and $_.ClassName -eq "#32770"
    } | Select-Object -First 1
    if ($compileDialog) { throw "Director reported a compilation error in reference_trace.ls." }

    [DirectorTestApiNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Milliseconds 350
    $movieLabelsPath = Join-Path $runPath "movie-labels.txt"
    for ($labelAttempt = 1; $labelAttempt -le 3 -and -not (Test-Path -LiteralPath $movieLabelsPath); $labelAttempt++) {
        Send-DirectorCommand -Process $director -Command "referenceExportMovieLabels()"
        Start-Sleep -Milliseconds 250
    }
    if (-not (Test-Path -LiteralPath $movieLabelsPath)) { throw "Director did not acknowledge the movie label export." }
    if ($request.operation -eq "verify-all") {
        $verificationEntries = Invoke-VerificationMatrix -Process $director -Menu $menu -Request $request
        Write-AtomicResult -Value ([PSCustomObject]@{
            schemaVersion = 1
            status = "completed"
            requestId = $request.id
            operation = "verify-all"
            source = "Macromedia Director 8 Trial in disconnected Windows Sandbox"
            instrumentation = "reference-trace-v2"
            movieLabels = "movie-labels.txt"
            verificationEntries = $verificationEntries
            workingMovie = "working.dir"
        })
        return
    }
    if ($request.operation -eq "score") {
        $scoreEntries = Invoke-ScoreInventory -Process $director -Request $request
        Write-AtomicResult -Value ([PSCustomObject]@{
            schemaVersion = 1
            status = "completed"
            requestId = $request.id
            operation = "score"
            source = "Macromedia Director 8 Trial in disconnected Windows Sandbox"
            instrumentation = "reference-trace-v2"
            movieLabels = "movie-labels.txt"
            scoreEntries = $scoreEntries
            workingMovie = "working.dir"
        })
        return
    }
    $frameCount = [int]$request.capture.frames
    if (-not $request.initialState) {
        if ($request.operation -eq "physics") {
            if ($request.launch.vector) {
                $testConfig = "test-api-physics|vector|" +
                    (ConvertTo-InvariantNumber $request.launch.vector.x) + "|" +
                    (ConvertTo-InvariantNumber $request.launch.vector.y) + "|$frameCount|" +
                    [int]$request.target.level
            }
            else {
                $testConfig = "test-api-physics|polar|" +
                    (ConvertTo-InvariantNumber $request.launch.distance) + "|" +
                    (ConvertTo-InvariantNumber $request.launch.angleDegrees) + "|$frameCount|" +
                    [int]$request.target.level
            }
        }
        else {
            $targetLevel = 0
            if ($request.target.kind -eq "level") { $targetLevel = [int]$request.target.level }
            $testConfig = "test-api-state|$frameCount|$targetLevel"
        }
        $testConfigExpression = ConvertTo-LingoStringExpression -Value $testConfig
        Send-DirectorCommand -Process $director -Command ('member("Reference Trace").comments = ' + $testConfigExpression)
    }
    else {
        $snapshot = $request.initialState
        $restoreOperation = [string]$request.operation
        $restoreLaunchKind = "none"
        $restoreLaunchA = "0"
        $restoreLaunchB = "0"
        if ($request.operation -eq "physics") {
            if ($request.launch.vector) {
                $restoreLaunchKind = "vector"
                $restoreLaunchA = ConvertTo-InvariantNumber $request.launch.vector.x
                $restoreLaunchB = ConvertTo-InvariantNumber $request.launch.vector.y
            }
            else {
                $restoreLaunchKind = "polar"
                $restoreLaunchA = ConvertTo-InvariantNumber $request.launch.distance
                $restoreLaunchB = ConvertTo-InvariantNumber $request.launch.angleDegrees
            }
        }
        $restoreAlert = (ConvertTo-LingoSymbol $snapshot.game.alert).TrimStart("#")
        $restoreGpsState = ""
        $restorePointX = $restorePointY = $restoreVelocityX = $restoreVelocityY = "0"
        $restoreFrameCount = $restoreTries = $restoreDistance = "0"
        if ($snapshot.gps) {
            $restoreGpsState = ([string]$snapshot.gps.state).TrimStart("#")
            $restorePointX = ConvertTo-InvariantNumber $snapshot.gps.point.x
            $restorePointY = ConvertTo-InvariantNumber $snapshot.gps.point.y
            $restoreVelocityX = ConvertTo-InvariantNumber $snapshot.gps.velocity.x
            $restoreVelocityY = ConvertTo-InvariantNumber $snapshot.gps.velocity.y
            $restoreFrameCount = ConvertTo-InvariantNumber $snapshot.gps.frameCount
            $restoreTries = ConvertTo-InvariantNumber $snapshot.gps.tries
            $restoreDistance = ConvertTo-InvariantNumber $snapshot.gps.distance
        }
        $restorePlanets = @($snapshot.planets | ForEach-Object {
            $orbit = $_.orbit
            @(
                [int]$_.channel,
                (ConvertTo-InvariantNumber $_.point.x),
                (ConvertTo-InvariantNumber $_.point.y),
                (ConvertTo-InvariantNumber $orbit.velocity.x),
                (ConvertTo-InvariantNumber $orbit.velocity.y),
                (ConvertTo-InvariantNumber $orbit.floatPoint.x $_.point.x),
                (ConvertTo-InvariantNumber $orbit.floatPoint.y $_.point.y)
            ) -join ","
        }) -join ";"
        $restoreBonuses = @($snapshot.bonuses | ForEach-Object {
            @(
                [int]$_.channel,
                ([string]$_.state).TrimStart("#"),
                [int]$_.memberNum,
                (ConvertTo-InvariantNumber $_.rotation),
                (ConvertTo-InvariantNumber $_.rotationVelocity 3)
            ) -join ","
        }) -join ";"
        $testConfig = @(
            "test-api-restore", $restoreOperation, $restoreLaunchKind, $restoreLaunchA, $restoreLaunchB,
            $frameCount, (ConvertTo-InvariantNumber $snapshot.game.score),
            (ConvertTo-InvariantNumber $snapshot.game.highScore $snapshot.game.score), $restoreAlert,
            $restoreGpsState, $restorePointX, $restorePointY, $restoreVelocityX, $restoreVelocityY,
            $restoreFrameCount, $restoreTries, $restoreDistance, $restorePlanets, $restoreBonuses,
            (ConvertTo-InvariantNumber $snapshot.game.level)
        ) -join "|"
        $testConfigExpression = ConvertTo-LingoStringExpression -Value $testConfig
        Send-DirectorCommand -Process $director -Command ('member("Reference Trace").comments = ' + $testConfigExpression)
    }
    if ($request.target.kind -eq "level") {
        $targetFrame = 10 + [int]$request.target.level
        Send-DirectorCommand -Process $director -Command "go $targetFrame"
    }
    elseif ($request.target.kind -eq "frame") {
        Send-DirectorCommand -Process $director -Command ("go " + [int]$request.target.frame)
    }
    else {
        $labelExpression = ConvertTo-LingoStringExpression -Value ([string]$request.target.label)
        Send-DirectorCommand -Process $director -Command "go($labelExpression)"
    }
    [DirectorTestApiNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Milliseconds 350
    Invoke-Menu -Process $director -Menu $menu -TextPattern "Play*" -PathPattern "*Control*"
    $movieStartedDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $movieStartedPath) -and [DateTime]::UtcNow -lt $movieStartedDeadline) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $movieStartedPath)) {
        throw "Director did not execute startMovie after the Play command."
    }

    $requestedScreenshots = @($request.capture.screenshotFrames | ForEach-Object { [int]$_ } | Sort-Object -Unique)
    $capturedScreenshots = New-Object 'System.Collections.Generic.List[object]'
    $captureDeadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(15, ($frameCount / 20.0) + 15))
    while (-not (Test-Path -LiteralPath $captureCompletePath) -and [DateTime]::UtcNow -lt $captureDeadline) {
        $observedSample = Get-TraceSample
        foreach ($wantedSample in $requestedScreenshots) {
            if ($wantedSample -le $observedSample -and -not ($capturedScreenshots | Where-Object requestedSample -eq $wantedSample)) {
                $fileName = "stage-sample-{0:D4}.png" -f $wantedSample
                Save-StageScreenshot -Process $director -Menu $menu -Path (Join-Path $runPath $fileName)
                $capturedScreenshots.Add([PSCustomObject]@{
                    requestedSample = $wantedSample
                    observedSample = $observedSample
                    file = $fileName
                })
            }
        }
        Start-Sleep -Milliseconds 20
    }
    if (-not (Test-Path -LiteralPath $captureCompletePath)) {
        throw "Timed out waiting for $frameCount Director frame boundaries."
    }
    foreach ($wantedSample in $requestedScreenshots) {
        if (-not ($capturedScreenshots | Where-Object requestedSample -eq $wantedSample)) {
            $observedSample = Get-TraceSample
            $fileName = "stage-sample-{0:D4}.png" -f $wantedSample
            Save-StageScreenshot -Process $director -Menu $menu -Path (Join-Path $runPath $fileName)
            $capturedScreenshots.Add([PSCustomObject]@{
                requestedSample = $wantedSample
                observedSample = $observedSample
                file = $fileName
            })
        }
    }

    Invoke-Menu -Process $director -Menu $menu -TextPattern "Stop*" -PathPattern "*Control*"
    Write-AtomicResult -Value ([PSCustomObject]@{
        schemaVersion = 1
        status = "completed"
        requestId = $request.id
        source = "Macromedia Director 8 Trial in disconnected Windows Sandbox"
        instrumentation = "reference-trace-v2"
        rawTrace = "raw-trace.tsv"
        movieLabels = "movie-labels.txt"
        screenshots = $capturedScreenshots
        workingMovie = "working.dir"
    })
}
catch {
    Write-AtomicResult -Value ([PSCustomObject]@{
        schemaVersion = 1
        status = "error"
        message = $_.Exception.Message
        exceptionType = $_.Exception.GetType().FullName
        scriptStackTrace = $_.ScriptStackTrace
        positionMessage = $_.InvocationInfo.PositionMessage
    })
}
finally {
    if ($director) {
        Stop-Process -Id $director.Id -Force -ErrorAction SilentlyContinue
    }
}
