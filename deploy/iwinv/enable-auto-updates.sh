#!/usr/bin/env bash
# One-time owner install. No SSH private keys, sudo passwords or provider keys are saved.
set -euo pipefail
if [[ $EUID != 0 ]]; then echo 'Run with sudo'; exit 1; fi
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
for required in /etc/systemd/system/gumseo-private-update.service /usr/local/lib/gumseo/compose.local.yml; do
  if [[ ! -f "$required" ]]; then echo 'Existing private automation installation required'; exit 1; fi
done
# Wait for an existing deployment/backup to finish before replacing its privileged helper.
exec 9>/var/lib/gumseo-automation/lock
flock -w 300 9
install -m 755 "$root/deploy/iwinv/automation.py" /usr/local/sbin/gumseo-private-automation
install -m 644 "$root/deploy/iwinv/update.timer" /etc/systemd/system/gumseo-private-update.timer
flock -u 9
systemctl daemon-reload
# Apply/check once; a failure keeps the manual-review safeguard intact.
systemctl start gumseo-private-update.service
python3 "$root/deploy/iwinv/install-publish-notify.py"
systemctl enable gumseo-private-update.timer
systemctl restart gumseo-private-update.timer
systemctl list-timers --all gumseo-private-update.timer
echo 'AUTO UPDATE configured: publication signal starts update; five-minute timer remains fallback.'
echo 'Existing keys, invites, storage, budgets and stopped-reader state are preserved.'
