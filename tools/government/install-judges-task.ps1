# Sets up the scheduled task "TheWay Judges Refresh" on a home computer (the cloud cannot reach fjc.gov):
# every day at 5:05 AM it runs judges_auto.py, which downloads the FJC judges file and the U.S. Courts
# future vacancies page, and rebuilds and publishes the federal courts pages only when one of them changed.
# Run once in PowerShell (no admin needed):  powershell -ExecutionPolicy Bypass -File install-judges-task.ps1
# It stores no password or key. The job uses the git login already on this computer to push.
# Log: D:\theway\judges-auto\files\judges_auto.log
$ErrorActionPreference = 'Stop'
$root = 'D:\theway\judges-auto'
New-Item -ItemType Directory -Force -Path "$root\files" | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'judges_auto.py') "$root\judges_auto.py" -Force   # runs from a fixed place
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction Stop).Source }
$argline = "-I `"$root\judges_auto.py`" --repo `"$root\repo`" --files `"$root\files`" --push"
$action = New-ScheduledTaskAction -Execute $py -Argument $argline -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 5:05am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'TheWay Judges Refresh' -Action $action -Trigger $trigger -Settings $settings -Description 'Michi Institute: FJC judges file to the federal courts pages (tools/government/judges_auto.py)' -Force | Out-Null
Write-Host 'Scheduled task "TheWay Judges Refresh" is set: every day at 5:05 AM.'
Write-Host 'To run it now: Start-ScheduledTask -TaskName "TheWay Judges Refresh"'
