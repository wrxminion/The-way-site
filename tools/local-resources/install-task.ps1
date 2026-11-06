# Registers the scheduled task "TheWay Local Resources": every hour, no window, below-normal priority,
# one run at a time, runs only while the user is signed in (so no password is stored anywhere).
# It never touches any other scheduled task.
param(
  [string]$Dir = "D:\theway\local-resources",
  [string]$Config = "D:\theway\local-resources\config.json"
)
# "python" can be the Microsoft Store stub (WindowsApps), which has no pythonw.exe. Prefer a real install.
$pyw = Get-ChildItem "C:\Program Files\Python3*\pythonw.exe", "$env:LOCALAPPDATA\Programs\Python\Python3*\pythonw.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $pyw) {
  $py = (Get-Command python -ErrorAction Stop).Source
  $pyw = Join-Path (Split-Path $py) "pythonw.exe"
}
if (-not (Test-Path $pyw) -or $pyw -like "*WindowsApps*") { throw "No real pythonw.exe found (only the Store stub)" }
$script = Join-Path $Dir "local_resources.py"
$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`" --config `"$Config`" run" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 55) -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -Priority 7
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "TheWay Local Resources" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "The Way: checks official county sites for the district lookup page (tools/local-resources). Stop it by creating local-resources.off in $Dir." -Force
