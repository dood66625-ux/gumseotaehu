#!/usr/bin/python3
"""Local operational signals only. No mail, provider requests or customer content."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

STATE = Path('/var/lib/gumseo-automation')
EXPORT = Path('/var/lib/gumseo-export')

def evaluate(now, health, free, backup_at, update_failed, review):
    issues = []
    for service in ('web', 'worker'):
        if health.get(service) != 'healthy':
            issues.append(service.upper() + '_UNHEALTHY')
    if 'review' in health and health['review'] != 'healthy':
        issues.append('REVIEW_CHECKOUT_UNHEALTHY')
    if 'review-proxy' in health and health['review-proxy'] != 'true':
        issues.append('REVIEW_PROXY_UNAVAILABLE')
    if free < 2 * 1024 ** 3:
        issues.append('DISK_SPACE_LOW')
    if not isinstance(backup_at, int) or backup_at > now + 30 or now - backup_at > 8 * 3600:
        issues.append('LOCAL_BACKUP_MISSING_OR_STALE')
    if update_failed:
        issues.append('UPDATE_LAST_RUN_FAILED')
    if review:
        issues.append('UPDATE_PAUSED_FOR_REVIEW')
    return {'version': 1, 'checkedAt': now, 'healthy': not issues, 'issues': issues, 'offsiteVerified': False}

def output(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=10).stdout.strip()

def read_deployed_commit(path):
    try:
        commit = path.read_text(encoding='ascii').strip()
    except (OSError, UnicodeError):
        return None
    return commit if re.fullmatch(r'[0-9a-f]{40}', commit) else None

def main():
    import grp

    if os.geteuid() != 0:
        raise RuntimeError('ROOT_REQUIRED')
    health = {}
    prefix='gumseo-sales-' if Path('/var/lib/gumseo-sales-control/active.json').exists() else 'gumseo-local-'
    for service in ('web', 'worker'):
        try:
            health[service] = output(['/usr/bin/docker', 'inspect', '--format', '{{.State.Health.Status}}', prefix + service + '-1'])
        except Exception:
            health[service] = 'unknown'
    if Path('/usr/local/lib/gumseo/compose.merchant-review.yml').exists():
        for name, expression, container in [('review','{{.State.Health.Status}}','gumseo-merchant-review-review-1'),('review-proxy','{{.State.Running}}','gumseo-merchant-review-proxy-1')]:
            try: health[name] = output(['/usr/bin/docker','inspect','--format',expression,container])
            except Exception: health[name] = 'unknown'
    try:
        backup_at = json.loads((STATE / 'backup-status.json').read_text())['at']
    except Exception:
        backup_at = None
    try:
        update_failed = output(['systemctl', 'show', 'gumseo-private-update.service', '-p', 'Result', '--value']) != 'success'
    except Exception:
        update_failed = True
    row = evaluate(int(time.time()), health, shutil.disk_usage('/var/lib').free, backup_at, update_failed, (STATE / 'review-required').exists())
    row['deployedCommit'] = read_deployed_commit(STATE / 'deployed-commit')
    EXPORT.mkdir(mode=0o750, exist_ok=True)
    os.chmod(EXPORT, 0o750)
    os.chown(EXPORT, 0, grp.getgrnam('gumseo').gr_gid)
    temporary = EXPORT / '.health.json.tmp'
    temporary.write_text(json.dumps(row) + '\n')
    os.chmod(temporary, 0o640)
    os.chown(temporary, 0, grp.getgrnam('gumseo').gr_gid)
    os.replace(temporary, EXPORT / 'health.json')
    print('PRIVATE_MONITOR_OK' if row['healthy'] else 'PRIVATE_MONITOR_ALERT ' + ','.join(row['issues']))

if __name__ == '__main__':
    main()
