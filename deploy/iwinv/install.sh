#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID != 0 ]]; then echo 'Run with sudo'; exit 1; fi
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
# Root-owned helpers: later repository pulls cannot change installed privileged code.
install -d -m 700 /var/lib/gumseo-automation
install -d -m 755 /usr/local/lib/gumseo
install -m 755 "$root/deploy/iwinv/automation.py" /usr/local/sbin/gumseo-private-automation
install -m 644 "$root/compose.local.yml" /usr/local/lib/gumseo/compose.local.yml
for kind in backup update; do
  install -m 644 "$root/deploy/iwinv/$kind.service" "/etc/systemd/system/gumseo-private-$kind.service"
  install -m 644 "$root/deploy/iwinv/$kind.timer" "/etc/systemd/system/gumseo-private-$kind.timer"
done
systemctl daemon-reload
# Apply and verify one release before enabling periodic work.
systemctl start gumseo-private-update.service
test -s /var/lib/gumseo-automation/deployed-commit
systemctl enable --now gumseo-private-update.timer gumseo-private-backup.timer
systemctl list-timers --all 'gumseo-private-*'
echo 'PRIVATE MOCK automation installed. Offsite backup remains a separate setup.'
