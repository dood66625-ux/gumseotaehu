#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
container=gumseo-local-worker-1
if [[ -f /var/lib/gumseo-sales-control/active.json ]]; then container=gumseo-sales-worker-1; fi
docker exec -i "$container" node --input-type=module < "$root/scripts/inspect-paid-generation.mjs"
printf '\nWorker 상태: '
docker inspect --format '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container"
