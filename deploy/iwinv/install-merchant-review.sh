#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
test -f /etc/gumseo/toss-sandbox.env
# Stop before opening ports if the latest runtime does not contain reviewed assets.
docker run --rm --network none --entrypoint node gumseo-local-web:local -e "require('node:fs').accessSync('/app/public/merchant-review/index.html')"
docker run --rm --network none --entrypoint node gumseo-local-worker:local -e "require('node:fs').accessSync('/app/dist/merchant-review.js')"
install -d -m 755 /usr/local/lib/gumseo
install -d -m 700 -o 1000 -g 1000 /var/lib/gumseo-merchant-review
install -m 644 "$root/deploy/iwinv/compose.merchant-review.yml" /usr/local/lib/gumseo/compose.merchant-review.yml
install -m 644 "$root/deploy/iwinv/Caddyfile.merchant-review" /usr/local/lib/gumseo/Caddyfile.merchant-review
install -m 755 "$root/deploy/iwinv/automation.py" /usr/local/sbin/gumseo-private-automation
install -m 755 "$root/deploy/iwinv/monitor.py" /usr/local/sbin/gumseo-private-monitor
docker compose -f /usr/local/lib/gumseo/compose.merchant-review.yml config --quiet
docker compose -f /usr/local/lib/gumseo/compose.merchant-review.yml pull proxy
ufw allow 80/tcp
ufw allow 443/tcp
docker compose -f /usr/local/lib/gumseo/compose.merchant-review.yml up -d --no-build --force-recreate
docker compose -f /usr/local/lib/gumseo/compose.merchant-review.yml ps -a
systemctl start gumseo-private-monitor.service
echo 'TEST REVIEW started. DNS, valid public HTTPS and end-to-end checkout must still be verified. No live payment enabled.'
