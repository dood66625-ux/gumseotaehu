#!/usr/bin/env bash
# Reads the running containers only. Never sources secret env files or changes flags.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
for container in gumseo-local-web-1 gumseo-local-worker-1; do
  printf '\n=== %s ===\n' "$container"
  docker exec -i "$container" node --input-type=module < "$root/scripts/quick-open-status.mjs"
done
