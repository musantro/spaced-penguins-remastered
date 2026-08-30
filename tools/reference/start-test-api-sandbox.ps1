[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RunDirectory,
    [ValidateRange(30, 900)][int]$TimeoutSeconds = 240
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$resolvedRunDirectory = (Resolve-Path -LiteralPath $RunDirectory).Path
$runsRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "reference\test-api\runs"))
if (-not $resolvedRunDirectory.StartsWith($runsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "RunDirectory must be a child of $runsRoot."
}
$configScript = Join-Path $PSScriptRoot "create-test-api-sandbox-config.ps1"
$sandboxExecutable = Join-Path $env:WINDIR "System32\WindowsSandbox.exe"
$resultPath = Join-Path $resolvedRunDirectory "result.json"
$movieStartedPath = Join-Path $resolvedRunDirectory "movie-started.txt"

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class SandboxDialogInspector
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static string[] GetDialogTexts(int wantedProcessId)
    {
        var result = new List<string>();
        EnumWindows(delegate(IntPtr window, IntPtr ignored)
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId != wantedProcessId || !IsWindowVisible(window)) return true;
            var className = ReadClass(window);
            if (className != "#32770") return true;
            var parts = new List<string>();
            var title = ReadText(window);
            if (!String.IsNullOrWhiteSpace(title)) parts.Add(title);
            EnumChildWindows(window, delegate(IntPtr child, IntPtr childIgnored)
            {
                var text = ReadText(child);
                if (!String.IsNullOrWhiteSpace(text)) parts.Add(text);
                return true;
            }, IntPtr.Zero);
            result.Add(String.Join(" | ", parts.ToArray()));
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static bool ClickDialogButton(int wantedProcessId, string[] wantedCaptions)
    {
        var clicked = false;
        EnumWindows(delegate(IntPtr window, IntPtr ignored)
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId != wantedProcessId || !IsWindowVisible(window) || ReadClass(window) != "#32770") return true;
            EnumChildWindows(window, delegate(IntPtr child, IntPtr childIgnored)
            {
                if (clicked || ReadClass(child) != "Button") return true;
                var caption = ReadText(child).Replace("&", "").Trim();
                foreach (var wanted in wantedCaptions)
                {
                    if (String.Equals(caption, wanted, StringComparison.OrdinalIgnoreCase))
                    {
                        SendMessage(child, 0x00F5, IntPtr.Zero, IntPtr.Zero);
                        clicked = true;
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);
            return !clicked;
        }, IntPtr.Zero);
        return clicked;
    }

    private static string ReadText(IntPtr window)
    {
        var text = new StringBuilder(4096);
        GetWindowText(window, text, text.Capacity);
        return text.ToString();
    }

    private static string ReadClass(IntPtr window)
    {
        var text = new StringBuilder(512);
        GetClassName(window, text, text.Capacity);
        return text.ToString();
    }
}
"@

function Stop-TestSandbox {
    $deadline = (Get-Date).AddSeconds(20)
    $headlessSince = $null
    while ((Get-Date) -lt $deadline) {
        $sandboxProcesses = @(Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue)
        if ($sandboxProcesses.Count -eq 0) { return }
        if (@($sandboxProcesses | Where-Object MainWindowHandle -ne 0).Count -eq 0) {
            if (-not $headlessSince) { $headlessSince = Get-Date }
            if ((Get-Date) -ge $headlessSince.AddSeconds(2)) {
                foreach ($process in $sandboxProcesses) {
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Milliseconds 200
            continue
        }
        $headlessSince = $null
        foreach ($process in $sandboxProcesses) {
            $dialogText = @([SandboxDialogInspector]::GetDialogTexts($process.Id)) -join " | "
            if ($dialogText -match "comentarios|feedback|send information|enviar información|connection.*lost|conexión.*perd") {
                [SandboxDialogInspector]::ClickDialogButton($process.Id, @("No", "Cancel", "Cancelar")) | Out-Null
            }
            elseif ($dialogText) {
                [SandboxDialogInspector]::ClickDialogButton($process.Id, @("OK", "Aceptar", "Sí", "Yes", "Cerrar", "Close")) | Out-Null
            }
            else {
                $process.CloseMainWindow() | Out-Null
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Windows Sandbox did not close cleanly after its confirmation dialog."
}

function Clear-AttemptOutputs {
    Get-ChildItem -LiteralPath $resolvedRunDirectory -Force | Where-Object Name -ne "request.json" |
        Remove-Item -Recurse -Force
}

if (-not (Test-Path -LiteralPath $sandboxExecutable)) {
    throw "Windows Sandbox is not installed or enabled."
}
if (Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue) {
    throw "Windows Sandbox is already running. Close it before running a reference API job."
}
if (Test-Path -LiteralPath $resultPath) {
    throw "The run directory already contains result.json: $resolvedRunDirectory"
}

$configPath = (& $configScript -RunDirectory $resolvedRunDirectory | Select-Object -Last 1)
$maximumAttempts = 3
$lastInfrastructureError = $null
for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
    if ($attempt -gt 1) {
        Clear-AttemptOutputs
        Start-Sleep -Seconds 2
    }
    $startedAt = Get-Date
    $sandboxProcess = Start-Process -FilePath $sandboxExecutable -ArgumentList $configPath -PassThru
    $deadline = $startedAt.AddSeconds($TimeoutSeconds)
    $initializationDeadline = $startedAt.AddSeconds([Math]::Min(90, $TimeoutSeconds))
    $guestStarted = $false
    $infrastructureFailure = $false
    while (-not (Test-Path -LiteralPath $resultPath) -and (Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $movieStartedPath) { $guestStarted = $true }
        $liveSandbox = Get-Process -Id $sandboxProcess.Id -ErrorAction SilentlyContinue
        if (-not $liveSandbox) {
            $lastInfrastructureError = "Windows Sandbox exited before producing a result."
            $infrastructureFailure = $true
            break
        }
        $dialogs = @([SandboxDialogInspector]::GetDialogTexts($liveSandbox.Id))
        if ($dialogs.Count -gt 0) {
            $lastInfrastructureError = "Windows Sandbox showed an initialization dialog: " + ($dialogs -join " || ")
            $infrastructureFailure = $true
            break
        }
        if (-not $guestStarted -and (Get-Date) -ge $initializationDeadline) {
            $lastInfrastructureError = "Windows Sandbox did not initialize Director within 90 seconds."
            $infrastructureFailure = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if (Test-Path -LiteralPath $resultPath) { break }
    Stop-TestSandbox
    if (-not $infrastructureFailure) {
        $lastInfrastructureError = "Timed out after $TimeoutSeconds seconds waiting for the Director test API job."
        break
    }
}
if (-not (Test-Path -LiteralPath $resultPath)) {
    Stop-TestSandbox
    throw "Director test API infrastructure failed after $maximumAttempts attempts: $lastInfrastructureError"
}

$result = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
# The guest publishes result.json atomically. From this point the mapped
# outputs are complete, so request the normal close and handle Windows'
# confirmation or feedback UI before considering a headless residual process.
Stop-TestSandbox
if ($result.status -ne "completed") {
    throw "Director test API failed: $($result.message)"
}
$result | ConvertTo-Json -Depth 8
