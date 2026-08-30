[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$trialPath = "C:\Reference\Director8Trial\director8trial.exe"
$sourceDirPath = "C:\Reference\Originals\spacedpenguin_bigidea_20020806.dir"
$authoringPath = "C:\Reference\Authoring"
$cachePath = "C:\Reference\Director8Cache"
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$statusPath = Join-Path $authoringPath "authoring-boot-$runId.json"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DirectorInstallerNativeMethods
{
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximum);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder text, int maximum);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out Rect rectangle);

    [DllImport("user32.dll")]
    private static extern IntPtr GetMenu(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int GetMenuItemCount(IntPtr menu);

    [DllImport("user32.dll")]
    private static extern IntPtr GetSubMenu(IntPtr menu, int position);

    [DllImport("user32.dll")]
    private static extern uint GetMenuItemID(IntPtr menu, int position);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int maximum, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public sealed class WindowRecord
    {
        public long Handle { get; set; }
        public long ParentHandle { get; set; }
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

    public static WindowRecord[] Snapshot(int wantedProcessId)
    {
        var result = new List<WindowRecord>();
        EnumWindows(delegate(IntPtr topWindow, IntPtr ignored)
        {
            uint processId;
            GetWindowThreadProcessId(topWindow, out processId);
            if (processId != wantedProcessId)
            {
                return true;
            }

            AddRecord(result, topWindow, IntPtr.Zero);
            EnumChildWindows(topWindow, delegate(IntPtr childWindow, IntPtr childIgnored)
            {
                uint childProcessId;
                GetWindowThreadProcessId(childWindow, out childProcessId);
                if (childProcessId == wantedProcessId)
                {
                    AddRecord(result, childWindow, topWindow);
                }
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
        const uint WM_COMMAND = 0x0111;
        SendMessage(window, WM_COMMAND, new IntPtr(commandId), IntPtr.Zero);
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
            if (subMenu != IntPtr.Zero)
            {
                WalkMenu(subMenu, path, result);
            }
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
            Handle = window.ToInt64(),
            ParentHandle = parent.ToInt64(),
            ClassName = className.ToString(),
            Text = title.ToString(),
            Visible = IsWindowVisible(window),
            Left = rectangle.Left,
            Top = rectangle.Top,
            Right = rectangle.Right,
            Bottom = rectangle.Bottom
        });
    }
}
"@

function Send-DirectorCommand {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $Process.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
    [Windows.Forms.Clipboard]::SetText($Command)
    [Windows.Forms.SendKeys]::SendWait("^v")
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 350

    $windows = [DirectorInstallerNativeMethods]::Snapshot($Process.Id)
    $dialog = $windows |
        Where-Object { $_.Visible -and $_.ParentHandle -eq 0 -and $_.ClassName -eq "#32770" } |
        Select-Object -First 1
    if ($dialog) {
        $dialogText = $windows |
            Where-Object { $_.ParentHandle -eq $dialog.Handle -and $_.ClassName -eq "Static" -and $_.Text } |
            Sort-Object { $_.Text.Length } -Descending |
            Select-Object -ExpandProperty Text -First 1
        throw "Director rejected Message command '$Command': $dialogText"
    }
}

function ConvertTo-LingoStringExpression {
    param([Parameter(Mandatory = $true)][string]$Value)

    $lineExpressions = foreach ($line in ($Value -split "`r?`n")) {
        if ($line.Length -eq 0) {
            "EMPTY"
            continue
        }

        $parts = $line -split '"', -1
        $partExpressions = for ($index = 0; $index -lt $parts.Count; $index++) {
            if ($index -gt 0) {
                "QUOTE"
            }
            if ($parts[$index].Length -gt 0) {
                '"' + $parts[$index] + '"'
            }
        }
        '(' + ($partExpressions -join ' & ') + ')'
    }
    return '(' + ($lineExpressions -join ' & RETURN & ') + ')'
}

function Export-DirectorCache {
    param([Parameter(Mandatory = $true)][string]$DirectorPath)

    $payloadPath = Join-Path $cachePath "payload"
    if (Test-Path -LiteralPath $payloadPath) {
        Remove-Item -LiteralPath $payloadPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $payloadPath | Out-Null

    $rootCandidates = @(
        [PSCustomObject]@{ Name = "ProgramFilesX86"; Path = ${env:ProgramFiles(x86)}; RelativePath = "Macromedia" }
        [PSCustomObject]@{ Name = "ProgramFiles"; Path = $env:ProgramFiles; RelativePath = "Macromedia" }
        [PSCustomObject]@{ Name = "CommonProgramFilesX86"; Path = ${env:CommonProgramFiles(x86)}; RelativePath = "Macromedia" }
        [PSCustomObject]@{ Name = "CommonProgramFiles"; Path = $env:CommonProgramFiles; RelativePath = "Macromedia" }
        [PSCustomObject]@{ Name = "ProgramData"; Path = $env:ProgramData; RelativePath = "Macromedia" }
    ) | Where-Object { $_.Path }

    $cachedDirectories = @()
    foreach ($candidate in $rootCandidates) {
        $sourcePath = Join-Path $candidate.Path $candidate.RelativePath
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            continue
        }

        $destinationPath = Join-Path (Join-Path $payloadPath $candidate.Name) $candidate.RelativePath
        New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
        Get-ChildItem -LiteralPath $sourcePath -Force |
            Copy-Item -Destination $destinationPath -Recurse -Force
        $cachedDirectories += [PSCustomObject]@{
            root = $candidate.Name
            relativePath = $candidate.RelativePath
        }
    }

    $registryPath = Join-Path $payloadPath "Registry"
    New-Item -ItemType Directory -Force -Path $registryPath | Out-Null
    $registryCandidates = @(
        [PSCustomObject]@{ Key = "HKLM\SOFTWARE\WOW6432Node\Macromedia"; ProviderPath = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Macromedia"; File = "hklm-wow6432-macromedia.reg" }
        [PSCustomObject]@{ Key = "HKLM\SOFTWARE\Macromedia"; ProviderPath = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Macromedia"; File = "hklm-macromedia.reg" }
        [PSCustomObject]@{ Key = "HKCU\Software\Macromedia"; ProviderPath = "Registry::HKEY_CURRENT_USER\Software\Macromedia"; File = "hkcu-macromedia.reg" }
    )
    $cachedRegistryFiles = @()
    foreach ($candidate in $registryCandidates) {
        if (-not (Test-Path -LiteralPath $candidate.ProviderPath)) {
            continue
        }

        $registryFilePath = Join-Path $registryPath $candidate.File
        & reg.exe export $candidate.Key $registryFilePath /y *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not cache Director registry key $($candidate.Key)."
        }
        $cachedRegistryFiles += $candidate.File
    }

    $directorLocation = $null
    foreach ($candidate in $rootCandidates) {
        $rootPrefix = $candidate.Path.TrimEnd("\") + "\"
        if ($DirectorPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $directorLocation = [PSCustomObject]@{
                root = $candidate.Name
                relativePath = $DirectorPath.Substring($rootPrefix.Length)
            }
            break
        }
    }
    if (-not $directorLocation) {
        throw "Director.exe is outside the directories supported by the reusable cache: $DirectorPath"
    }

    $manifest = [ordered]@{
        schemaVersion = 1
        product = "Macromedia Director 8 Trial"
        installerSha256 = "9fffc9c721a59a27d5b444aab0f967215f70f51cdbe23ab9c0df845c6efd4d56"
        createdAtUtc = [DateTime]::UtcNow.ToString("o")
        director = $directorLocation
        directories = $cachedDirectories
        registryFiles = $cachedRegistryFiles
    }
    $manifestTemporaryPath = Join-Path $cachePath "cache-manifest.json.tmp"
    $manifestPath = Join-Path $cachePath "cache-manifest.json"
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestTemporaryPath -Encoding UTF8
    Move-Item -LiteralPath $manifestTemporaryPath -Destination $manifestPath -Force
}

try {
    if (-not (Test-Path -LiteralPath $trialPath)) {
        throw "Director 8 trial is not available at $trialPath."
    }
    if (-not (Test-Path -LiteralPath $sourceDirPath)) {
        throw "Reconstructed canonical DIR is not available at $sourceDirPath."
    }

    New-Item -ItemType Directory -Force -Path $authoringPath | Out-Null
    $workingDirPath = Join-Path $authoringPath "spacedpenguin_instrumented.dir"
    Copy-Item -LiteralPath $sourceDirPath -Destination $workingDirPath -Force
    $tracePath = Join-Path $authoringPath "reference-trace.tsv"
    if (Test-Path -LiteralPath $tracePath) {
        Remove-Item -LiteralPath $tracePath -Force
    }
    $readyPath = Join-Path $authoringPath "instrumentation-ready.txt"
    if (Test-Path -LiteralPath $readyPath) {
        Remove-Item -LiteralPath $readyPath -Force
    }
    $nativeTracePath = Join-Path $authoringPath "native-lingo-trace.log"
    if (Test-Path -LiteralPath $nativeTracePath) {
        Remove-Item -LiteralPath $nativeTracePath -Force
    }
    $bootstrapLogPath = Join-Path $authoringPath "bootstrap-message.log"
    if (Test-Path -LiteralPath $bootstrapLogPath) {
        Remove-Item -LiteralPath $bootstrapLogPath -Force
    }

    $installer = Start-Process -FilePath $trialPath -WorkingDirectory (Split-Path $trialPath) -PassThru
    Start-Sleep -Seconds 5
    $installer.Refresh()

    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 3
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 3
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 3
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 3
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 5
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 20
    $installer.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($installer.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    $installer.WaitForExit(10000) | Out-Null

    $directorRoots = @(
        (Join-Path ${env:ProgramFiles(x86)} "Macromedia")
        (Join-Path $env:ProgramFiles "Macromedia")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $directorPath = $directorRoots |
        ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter "Director.exe" -File -Recurse -ErrorAction SilentlyContinue } |
        Select-Object -ExpandProperty FullName -First 1
    if (-not $directorPath) {
        throw "Director 8 installation completed, but Director.exe could not be located."
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
        throw "Director 8 launched, but its authoring process could not be identified."
    }
    Start-Sleep -Seconds 8
    $director.Refresh()
    # The reconstructed movie references Arial Narrow. Director displays a
    # missing-font notice before its main window can receive commands.
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 1

    # new(#script) targets the currently active cast. Select the Internal cast
    # explicitly so window activation order cannot redirect the observer into
    # one of the linked casts.
    $directorMenu = [DirectorInstallerNativeMethods]::SnapshotMenu($director.MainWindowHandle)
    $internalCastMenuItem = $directorMenu |
        Where-Object {
            ((($_.Path -replace "&", "") -replace "\s+", " ").Trim()) -eq "Window > Cast > Internal"
        } |
        Select-Object -First 1
    if (-not $internalCastMenuItem) {
        throw "Director's Internal Cast menu command could not be identified."
    }
    [DirectorInstallerNativeMethods]::InvokeMenuItem($director.MainWindowHandle, $internalCastMenuItem.CommandId)
    Start-Sleep -Seconds 1

    # Use Director's own Message window as a programmatic authoring API. The
    # inserted member exists only in the writable reconstructed copy.
    $director.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Seconds 1
    $messageWindowInventoryPath = Join-Path $authoringPath "director8-message-window-$runId.json"
    [DirectorInstallerNativeMethods]::Snapshot($director.Id) |
        ConvertTo-Json -Depth 4 |
        Set-Content -LiteralPath $messageWindowInventoryPath -Encoding UTF8
    $instrumentationSource = Get-Content -Raw -LiteralPath "C:\Reference\Instrumentation\reference_trace.ls"
    $instrumentationExpression = ConvertTo-LingoStringExpression -Value $instrumentationSource
    $bootstrapCommands = @(
        'the traceLogFile = "C:/Reference/Authoring/bootstrap-message.log"'
        'put "reference bootstrap begin"'
        'global gReferenceBootstrapMember'
        'gReferenceBootstrapMember = new(#script)'
        'gReferenceBootstrapMember.name = "Reference Trace"'
        'gReferenceBootstrapMember.scriptType = #movie'
        ('gReferenceBootstrapMember.scriptText = ' + $instrumentationExpression)
    )
    foreach ($command in $bootstrapCommands) {
        Send-DirectorCommand -Process $director -Command $command
    }

    $director.Refresh()
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Seconds 1
    $menuInventoryPath = Join-Path $authoringPath "director8-menu-$runId.json"
    $directorMenu | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $menuInventoryPath -Encoding UTF8
    $recompileMenuItem = $directorMenu |
        Where-Object { ($_.Text -replace "&", "") -like "Recompile All Scripts*" } |
        Select-Object -First 1
    if (-not $recompileMenuItem -or $recompileMenuItem.CommandId -lt 0) {
        throw "Director's Recompile All Scripts menu command could not be identified."
    }
    [DirectorInstallerNativeMethods]::InvokeMenuItem($director.MainWindowHandle, $recompileMenuItem.CommandId)
    Start-Sleep -Seconds 2
    $compileWindows = [DirectorInstallerNativeMethods]::Snapshot($director.Id)
    $compileDialog = $compileWindows |
        Where-Object { $_.Visible -and $_.ParentHandle -eq 0 -and $_.ClassName -eq "#32770" } |
        Select-Object -First 1
    if ($compileDialog) {
        $compileDialogText = $compileWindows |
            Where-Object { $_.ParentHandle -eq $compileDialog.Handle -and $_.ClassName -eq "Static" -and $_.Text } |
            Sort-Object { $_.Text.Length } -Descending |
            Select-Object -ExpandProperty Text -First 1
        throw "Director failed to recompile the injected reference script: $compileDialogText"
    }

    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Seconds 1

    $postCompileCommands = @(
        'put gReferenceBootstrapMember.scriptType'
        'put gReferenceBootstrapMember.scriptText.length'
        'the traceLogFile = EMPTY'
        'referenceProbe()'
    )
    foreach ($command in $postCompileCommands) {
        Send-DirectorCommand -Process $director -Command $command
    }
    $postBootstrapInventoryPath = Join-Path $authoringPath "director8-post-bootstrap-$runId.json"
    [DirectorInstallerNativeMethods]::Snapshot($director.Id) |
        ConvertTo-Json -Depth 4 |
        Set-Content -LiteralPath $postBootstrapInventoryPath -Encoding UTF8

    $probeDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $readyPath) -and [DateTime]::UtcNow -lt $probeDeadline) {
        Start-Sleep -Milliseconds 250
    }
    if (-not (Test-Path -LiteralPath $readyPath)) {
        throw "Director did not compile or execute the reference instrumentation."
    }
    if ((Get-Content -Raw -LiteralPath $readyPath) -notmatch "reference-trace-v2") {
        throw "Director wrote an unexpected instrumentation probe value."
    }

    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^s")
    Start-Sleep -Seconds 1

    Send-DirectorCommand -Process $director -Command 'referenceArmNativeTrace()'
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Seconds 1

    $playMenuItem = $directorMenu |
        Where-Object { $_.Path -like "*Control*" -and ($_.Text -replace "&", "") -like "Play*" } |
        Select-Object -First 1
    $stopMenuItem = $directorMenu |
        Where-Object { $_.Path -like "*Control*" -and ($_.Text -replace "&", "") -like "Stop*" } |
        Select-Object -First 1
    if (-not $playMenuItem -or -not $stopMenuItem) {
        throw "Director's Play and Stop menu commands could not be identified."
    }

    [DirectorInstallerNativeMethods]::InvokeMenuItem($director.MainWindowHandle, $playMenuItem.CommandId)
    Start-Sleep -Seconds 1
    [DirectorInstallerNativeMethods]::InvokeMenuItem($director.MainWindowHandle, $stopMenuItem.CommandId)
    Start-Sleep -Seconds 1
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Seconds 1
    Send-DirectorCommand -Process $director -Command 'referenceDisableNativeTrace()'
    [DirectorInstallerNativeMethods]::SetForegroundWindow($director.MainWindowHandle) | Out-Null
    [Windows.Forms.SendKeys]::SendWait("^m")
    Start-Sleep -Milliseconds 500
    if (-not (Test-Path -LiteralPath $nativeTracePath)) {
        throw "Director did not create the native Lingo trace."
    }
    $nativeTraceLength = (Get-Item -LiteralPath $nativeTracePath).Length
    if ($nativeTraceLength -lt 100) {
        throw "Director's native Lingo trace was unexpectedly short ($nativeTraceLength bytes)."
    }

    # Windows Sandbox discards its system disk at close. Persist a narrowly
    # scoped application layer so later sessions restore Director instead of
    # running the vintage installer again.
    Export-DirectorCache -DirectorPath $directorPath

    [PSCustomObject]@{
        status = "authoring-started"
        startupMode = "installed-and-cached"
        runId = $runId
        installerProcessId = $installer.Id
        installerWindowTitle = $installer.MainWindowTitle
        directorLauncherProcessId = $directorLauncher.Id
        directorProcessId = $director.Id
        directorWindowTitle = $director.MainWindowTitle
        directorExecutable = $directorPath
        workingDir = [IO.Path]::GetFileName($workingDirPath)
        instrumentation = "reference-trace-v2"
        nativeTraceControl = @(
            "referenceArmNativeTrace()"
            "referenceEnableNativeTrace()"
            "referenceDisableNativeTrace()"
        )
        nativeTraceBytes = $nativeTraceLength
        debuggerCommands = @(
            $directorMenu |
                Where-Object {
                    ($_.Text -replace "&", "") -like "Toggle Breakpoint*" -or
                    ($_.Text -replace "&", "") -like "Step Script*" -or
                    ($_.Text -replace "&", "") -like "Step Into Script*" -or
                    ($_.Text -replace "&", "") -like "Run Script*"
                } |
                Select-Object Text, CommandId
        )
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
catch {
    [PSCustomObject]@{
        status = "error"
        runId = $runId
        message = $_.Exception.Message
    } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
