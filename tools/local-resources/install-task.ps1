# Registers the scheduled task "TheWay Local Resources": every hour, no window, below-normal priority,
# one run at a time, runs only while the user is signed in (so no password is stored anywhere).
# It never touches any other scheduled task.
param(
  [string]$Dir = "D:\theway\local-resources",
  [string]$Config = "D:\theway\local-resources\config.json"
)
$py = (Get-Command python -ErrorAction Stop).Source
$pyw = Join-Path (Split-Path $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { throw "pythonw.exe not found next to $py" }
$script = Join-Path $Dir "local_resources.py"
$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`" --config `"$Config`" run" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 55) -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -Priority 7
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "TheWay Local Resources" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "The Way: checks official county sites for the district lookup page (tools/local-resources). Stop it by creating local-resources.off in $Dir." -Force
