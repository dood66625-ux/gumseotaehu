#!/usr/bin/env bash
# One-time route installation only; future UI deployments keep the proxy running.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
compose=/usr/local/lib/gumseo/compose.merchant-review.yml
target=/usr/local/lib/gumseo/Caddyfile.merchant-review
test -f "$compose"
test -f "$target"
status=$(curl --silent --show-error --max-time 8 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3100/api/usage)
[[ $status == 405 ]] || { echo 'Visitor runtime is not deployed yet; wait for automatic deployment, then retry.'; exit 1; }
docker run --rm --network none --read-only --cap-drop ALL \
  --tmpfs /data --tmpfs /config --tmpfs /tmp \
  -v "$root/deploy/iwinv/Caddyfile.merchant-review:/etc/caddy/Caddyfile:ro" \
  --entrypoint caddy caddy:2.11.9-alpine validate --config /etc/caddy/Caddyfile --adapter caddyfile
backup=$(mktemp /usr/local/lib/gumseo/Caddyfile.visitor-backup.XXXXXX)
cp "$target" "$backup"
rollback() {
  install -m 644 "$backup" "$target"
  docker compose -f "$compose" up -d --no-build --no-deps --force-recreate proxy || true
  echo 'Visitor route update failed; previous proxy configuration restored.' >&2
}
trap rollback ERR
install -m 644 "$root/deploy/iwinv/Caddyfile.merchant-review" "$target"
# Caddy admin API is intentionally disabled, so this initial config change needs one proxy replacement.
docker compose -f "$compose" up -d --no-build --no-deps --force-recreate proxy
status=$(curl --silent --show-error --retry 4 --retry-all-errors --retry-delay 1 --max-time 8 \
  --resolve gumseo.kr:443:127.0.0.1 --output /dev/null --write-out '%{http_code}' https://gumseo.kr/api/usage)
[[ $status == 405 ]]
status=$(curl --silent --show-error --max-time 8 --resolve gumseo.kr:443:127.0.0.1 --output /dev/null --write-out '%{http_code}' https://gumseo.kr/admin)
[[ $status == 200 ]]
trap - ERR
rm "$backup"
echo 'VISITOR_LOG_ROUTE_ENABLED; payment, mail, AI and administrator access settings preserved.'
echo 'Administrator login: https://gumseo.kr/admin ; visitors: https://gumseo.kr/admin/visitors'
echo 'Existing password and one-time MFA remain required. Other customer API routes remain blocked.'
