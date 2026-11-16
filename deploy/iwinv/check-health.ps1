param([switch]$Notify)
$ErrorActionPreference = 'Stop'
$folder = Join-Path $env:USERPROFILE 'GumseoTools'
$temporary = Join-Path $folder 'health.partial.json'
$state = Join-Path $folder 'monitor-state.json'
$message = 'Unable to check server health. Check SSH/network access.'
$ok = $false
try {
    & scp -q -o BatchMode=yes -o ConnectTimeout=15 'gumseo@115.68.223.204:/var/lib/gumseo-export/health.json' $temporary
    if ($LASTEXITCODE -ne 0) { throw 'Health transfer failed.' }
    if ((Get-Item $temporary).Length -gt 8192) { throw 'Invalid health document.' }
    $row = Get-Content -Raw $temporary | ConvertFrom-Json
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($row.version -ne 1 -or $row.checkedAt -gt ($now + 30) -or ($now - $row.checkedAt) -gt 900) {
        throw 'Health snapshot missing, stale or invalid.'
    }
    $codes = @($row.issues)
    foreach ($code in $codes) {
        if ($code -notmatch '^[A-Z_]{3,80}$') { throw 'Invalid health code.' }
    }
    $ok = ($row.healthy -eq $true -and $codes.Count -eq 0)
    $message = if ($ok) { 'Server and local backup checks passed. Offsite copies are checked separately.' } else { 'Gumseo server needs attention: ' + ($codes -join ', ') }
} catch {
    # Fixed text only: do not put raw provider/SSH output in desktop notifications.
} finally {
    Remove-Item $temporary -ErrorAction SilentlyContinue
}
$previous = $null
if (Test-Path $state) {
    try { $previous = Get-Content -Raw $state | ConvertFrom-Json } catch {}
}
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$lastNotified = 0
if ($previous) { $lastNotified = $previous.lastNotified }
if (-not $ok -and $Notify -and (($now - $lastNotified) -ge 21600 -or $previous.healthy -eq $true)) {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($message, 15, 'Gumseo service alert', 48)
    $lastNotified = $now
}
@{ checkedAt = $now; healthy = $ok; message = $message; lastNotified = $lastNotified } | ConvertTo-Json | Set-Content -Encoding UTF8 $state
Write-Output $message
if (-not $ok) { exit 1 }
