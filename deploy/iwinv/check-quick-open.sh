#!/usr/bin/env bash
# Reads the running containers only. Never sources secret env files or changes flags.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ ${1:-} == '' || ${1:-} == '--summary' ]] || { echo 'Usage: check-quick-open.sh [--summary]'; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
for container in gumseo-local-web-1 gumseo-local-worker-1; do
  printf '\n=== %s ===\n' "$container"
  if [[ ${1:-} == '--summary' ]]; then
    docker exec -i -e QUICK_OPEN_STATUS_SUMMARY=1 "$container" node --input-type=module < "$root/scripts/quick-open-status.mjs"
  else
    docker exec -i "$container" node --input-type=module < "$root/scripts/quick-open-status.mjs"
  fi
done

if [[ ${1:-} == '--summary' ]]; then
  python3 "$root/deploy/iwinv/inspect-existing-service-config.py"
fi
