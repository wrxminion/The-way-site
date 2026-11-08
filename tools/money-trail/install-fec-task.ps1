# Sets up the scheduled task "TheWay FEC Money Web" on FRAK: every day at 4:15 AM it runs fec_auto.py, which
# downloads the FEC bulk files that changed, rebuilds the FEC money on the Money web and publishes it.
# Run once in PowerShell (no admin needed):  powershell -ExecutionPolicy Bypass -File install-fec-task.ps1
# It stores no password or key. The job uses the git login already on this computer to push; if that fails,
# it writes a patch to D:\theway\drop\fec instead. Log: D:\theway\fec-auto\bulk\fec_auto.log
$ErrorActionPreference = 'Stop'
$root = 'D:\theway\fec-auto'
New-Item -ItemType Directory -Force -Path "$root\bulk", 'D:\theway\drop\fec' | Out-Null
$script = Join-Path $PSScriptRoot 'fec_auto.py'
Copy-Item $script "$root\fec_auto.py" -Force   # the job updates its own repo copy, so it runs from a fixed place
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction Stop).Source }
$argline = "-I `"$root\fec_auto.py`" --repo `"$root\repo`" --bulk `"$root\bulk`" --drop D:\theway\drop\fec --push"
$action = New-ScheduledTaskAction -Execute $py -Argument $argline -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 4:15am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TheWay FEC Money Web' -Action $action -Trigger $trigger -Settings $settings -Description 'Michi Institute: FEC bulk files to the Money web (tools/money-trail/fec_auto.py)' -Force | Out-Null
Write-Host 'Scheduled task "TheWay FEC Money Web" is set: every day at 4:15 AM.'
Write-Host 'To run it now: Start-ScheduledTask -TaskName "TheWay FEC Money Web"'
