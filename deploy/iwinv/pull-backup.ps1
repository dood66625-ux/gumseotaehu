param([string]$Destination = "$env:USERPROFILE\GumseoBackups", [switch]$Batch)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pending = Join-Path $Destination "$stamp.partial"
$checksum = Join-Path $Destination "$stamp.sha256.partial"
$sshArgs = @()
if ($Batch) { $sshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15') }
try {
    & scp @sshArgs 'gumseo@115.68.223.204:/var/lib/gumseo-export/latest.tar.gz' $pending
    if ($LASTEXITCODE -ne 0) { throw 'Backup transfer failed; verify SSH key access.' }
    & scp @sshArgs 'gumseo@115.68.223.204:/var/lib/gumseo-export/latest.sha256' $checksum
    if ($LASTEXITCODE -ne 0) { throw 'Checksum transfer failed.' }
    $expected = (Get-Content -Raw $checksum).Trim()
    $actual = (Get-FileHash -Algorithm SHA256 $pending).Hash.ToLowerInvariant()
    if ($expected -notmatch '^[0-9a-f]{64}$' -or $expected -ne $actual) {
        throw 'Backup changed during copy or checksum mismatch; retry. Existing backups retained.'
    }
    $final = Join-Path $Destination "$stamp.tar.gz"
    Move-Item $pending $final
    Remove-Item $checksum
    Write-Output "Encrypted offsite copy verified: $final"
    Write-Output 'Keep DATA_KEY separately. Actual restoration requires the current authoritative deletion checkpoint.'
} catch {
    Remove-Item $pending, $checksum -ErrorAction SilentlyContinue
    throw
}
