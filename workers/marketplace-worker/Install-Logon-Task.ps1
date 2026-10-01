$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "Ferocity Marketplace Worker"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$supervisorPath = Join-Path $workerRoot "src\supervisor.js"

if (-not (Test-Path -LiteralPath (Join-Path $workerRoot "worker.config.json"))) {
  throw "Configure and test the worker before installing auto-start."
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"{0}"' -f $supervisorPath) -WorkingDirectory $workerRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Installed scheduled task: $taskName"
Write-Host "It starts after this Windows user signs in and runs without an extra console window."
