#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ $# == 1 && $1 =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'Explicit order UUID required'; exit 1; }
[[ -f /var/lib/gumseo-sales-control/active.json ]] || { echo 'SALES_NOT_ACTIVE'; exit 1; }
container=gumseo-sales-worker-1
# Wait for the ordinary rolling updater; do not restart a running generation.
for attempt in $(seq 1 41); do
  if docker exec "$container" test -f /app/dist/recover-paid-generation.js; then
    docker exec "$container" node /app/dist/recover-paid-generation.js "$1" --approve-one-new-generation
    echo '작성 상태를 확인합니다 (기존 예산 내 새 생성은 최대 1회).'
    for check in $(seq 1 50); do
      state=$(docker exec "$container" node --input-type=module -e '
        import {DatabaseSync} from "node:sqlite";
        const d=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:true});
        const o=d.prepare("SELECT fulfillment FROM orders WHERE id=?").get(process.argv[1]);
        console.log(o?.fulfillment || "missing");d.close();' "$1")
      if [[ $state == ready ]]; then echo 'REPORT_READY; 기존 결제 화면을 새로고침해 운명서를 열어주세요.'; exit 0; fi
      if [[ $state == retrying || $state == failed || $state == missing ]]; then
        root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
        bash "$root/deploy/iwinv/check-paid-generation.sh"
        exit 1
      fi
      sleep 3
    done
    echo 'GENERATION_STILL_PENDING; 재실행해도 새 생성 횟수는 늘어나지 않습니다.'
    exit 0
  fi
  if [[ $attempt == 41 ]]; then echo 'RECOVERY_IMAGE_NOT_YET_DEPLOYED; no order changed'; exit 1; fi
  echo '복구 버전 배포 대기 중 (서비스 유지)...'
  systemctl start gumseo-private-update.service
  sleep 15
done
