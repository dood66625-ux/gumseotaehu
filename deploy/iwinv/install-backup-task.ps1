$ErrorActionPreference = 'Stop'
$pull = Join-Path $PSScriptRoot 'pull-backup.ps1'
if (-not (Test-Path $pull)) { throw 'Keep pull-backup.ps1 beside this installer.' }
& ssh -o BatchMode=yes -o ConnectTimeout=15 gumseo@115.68.223.204 true
if ($LASTEXITCODE -ne 0) {
    throw 'Unattended SSH is not ready. Load your existing key into Windows ssh-agent first. No task installed; no passwords saved.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Batch' -f $pull)
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName 'GumseoEncryptedBackup' -Action $action -Trigger @($repeat, $logon) -Principal $principal -Settings $settings -Description 'Copy encrypted private mock backup while logged in; never saves SSH key passphrase.' -Force | Out-Null
Start-ScheduledTask -TaskName 'GumseoEncryptedBackup'
Write-Output 'Backup task registered. Check LastTaskResult and a verified archive in GumseoBackups; registration alone is not proof of an offsite copy.'
