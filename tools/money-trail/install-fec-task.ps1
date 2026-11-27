# Sets up the scheduled task "TheWay FEC Money Web": every day at 4:15 AM it runs fec_auto.py, which downloads the
# FEC bulk files that changed, rebuilds the FEC money on the Money web and publishes it.
# Made for FRAK; since Nov 27 2026 it runs on Bender (FRAK was not reachable). Any Windows computer with Python 3 and
# git works. Run once in PowerShell (no admin needed):  powershell -ExecutionPolicy Bypass -File install-fec-task.ps1
# It stores no password or key. The job uses the git login already on this computer to push; if that fails,
# it writes a patch to D:\theway\drop\fec instead. Log: D:\theway\fec-auto\bulk\fec_auto.log
param([string]$Root = 'D:\theway\fec-auto', [string]$Drop = 'D:\theway\drop\fec')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path "$Root\bulk", $Drop | Out-Null
$script = Join-Path $PSScriptRoot 'fec_auto.py'
Copy-Item $script "$Root\fec_auto.py" -Force   # the job updates its own repo copy, so it runs from a fixed place
# The real python.exe, not the Microsoft Store alias in WindowsApps (that alias can fail when no one is looking).
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction Stop).Source }
$real = & $py -c 'import sys; print(sys.executable)'
if ($real -and (Test-Path $real)) { $py = $real }
$argline = "-I `"$Root\fec_auto.py`" --repo `"$Root\repo`" --bulk `"$Root\bulk`" --drop `"$Drop`" --push"
$action = New-ScheduledTaskAction -Execute $py -Argument $argline -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Daily -At 4:15am
# A laptop runs it on battery too, and a missed run starts as soon as the computer is on again.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TheWay FEC Money Web' -Action $action -Trigger $trigger -Settings $settings -Description 'Michi Institute: FEC bulk files to the Money web (tools/money-trail/fec_auto.py)' -Force | Out-Null
Write-Host "Scheduled task ""TheWay FEC Money Web"" is set: every day at 4:15 AM, with $py"
Write-Host 'To run it now: Start-ScheduledTask -TaskName "TheWay FEC Money Web"'
