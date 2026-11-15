# 이식 가능한 로컬 실행 패키지

이 구성은 합성 정보만 사용하는 로컬 검증판이다. 계정·호스팅 구매, 공개 배포, 실제 결제/메일/AI 연결을 수행하지 않는다. 실제 사이트 공개 전에는 출시 차단 목록을 해결해야 한다.

## 소스에서 빌드

```sh
npm ci
npm run setup
npm run build
# 값을 출력하지 않고 구성만 확인한다.
docker compose --env-file .env.local -f compose.local.yml config --quiet
docker compose --env-file .env.local -f compose.local.yml build
docker compose --env-file .env.local -f compose.local.yml up -d
```

웹은 호스트의 `127.0.0.1:3100`에만 연결한다. 작업자는 네트워크 없이 실행한다. 웹에는 localhost 포트 제공을 위한 일반 Docker bridge가 있으며, 방화벽 수준의 외부 통신 차단이라고 주장하지 않는다. 웹/작업자 모두 local/disabled 모드로 고정되고 OpenAI/Toss/메일 자격증명을 전달하지 않는다. 서버와 작업자는 같은 named volume과 같은 로컬 암호화/인증 키를 사용한다. 영속 SQLite는 단일 호스트 전용이며 여러 서버에 무작정 복제하지 않는다.

컨테이너는 node 사용자로 실행하고 root filesystem은 읽기 전용이다. web의 `/tmp`만 제한된 tmpfs를 사용한다. 최초 storage 서비스만 root로 데이터 볼륨의 소유권을 1000:1000으로 맞춘 뒤 종료한다. 앱 데이터 디렉터리 권한은 0700, DB는 0600이다. 설정 변경 때 기존 데이터 키를 새로 만들면 이전 데이터를 읽을 수 없으므로 별도 보관해야 한다.

`docker compose down`은 데이터 볼륨을 보존한다. **`down -v`는 데이터 삭제이므로 사용하지 않는다.** 업데이트·이전 전에는 기존 암호화 백업/삭제 이력 절차를 실행해야 한다. 이 Compose 파일이 외부 백업이나 운영 TLS를 제공하는 것은 아니다.

## 빌드된 파일로 이미지 만들기

현재 개발 환경은 컨테이너 안에서 npm 저장소에 연결되지 않는다. 소스 Dockerfile의 신규 설치부터 시작하는 clean build는 이 환경에서 미검증이다. 대신 호스트에서 검증한 Next standalone + worker 산출물로 네트워크 없는 이미지 빌드와 실제 구동을 확인했다.

```sh
npm run build
# 항상 새 디렉터리를 지정한다. 기존 패키지는 덮어쓰지 않는다.
npm run runtime:package -- var/runtime/release-new
docker build --network none --target web -t gumseo-local-web:local var/runtime/release-new
docker build --network none --target worker -t gumseo-local-worker:local var/runtime/release-new
docker compose --env-file .env.local -f compose.local.yml up -d --no-build
```

기본 Node 이미지는 미리 확보되어 있어야 한다. 산출물은 생성한 Linux/CPU 아키텍처용이며 다른 OS/아키텍처의 호환성을 보장하지 않는다. 번들 manifest에 Node/OS/아키텍처와 파일 SHA-256을 기록한다. 해시는 서명이나 신뢰할 수 있는 배포 경로를 대신하지 않는다.

패키지는 명시된 runtime 파일만 복사하며 `.env*`, DB/var, 개발 소스, 원본 업로드 문서를 포함하지 않는다. 외부 경로/절대 경로 symlink와 설정된 비밀값을 발견하면 실패하고 새 부분 패키지를 제거한다. 필요한 내부 상대 symlink는 보존한다. 이미지의 파일 소유권도 node로 설정한다. 테스트에서 실제로 발견한 파일 접근 권한 오류와 번들 zod 누락을 수정했다. 소스 Dockerfile의 worker stage도 개발용 build stage를 통째로 상속하지 않는다.

## 상태 확인과 장애

```sh
docker compose --env-file .env.local -f compose.local.yml ps
docker compose --env-file .env.local -f compose.local.yml exec -T web node dist/runtime-health.js web
docker compose --env-file .env.local -f compose.local.yml exec -T worker node dist/runtime-health.js worker
```

웹은 로컬 health 응답의 모드/외부 통신 차단 표시를 확인한다. 작업자는 기존 DB를 읽기 전용으로 열어 60초 미만 heartbeat를 확인한다. DB를 새로 생성하거나 마이그레이션하지 않는다. 미래 시각·stale·없는 DB·없는 heartbeat·symlink는 실패한다. 웹 probe 성공만으로 DB/작업자가 정상이라고 판단하지 않는다. Docker healthcheck는 unhealthy 표시를 제공하며 **unhealthy만으로 컨테이너를 자동 재시작하지 않는다**. restart 정책은 프로세스 종료에 반응한다. 실제 경보·당직·외부 모니터링은 별도다.

## 실행 증거와 재현

2026-11-15: 합성 전용 자격증명, 별도 `gumseo-runtime-smoke` 프로젝트/볼륨, 오프라인 빌드 이미지로 다음을 검증했다.

- Node 24 Linux 컨테이너에서 웹·작업자 구동, 실제 host loopback HTTP 접속.
- 가상 이메일 로컬 인증 → 22,000원 모의 결제 → 작업자 보고서 생성 → 유효 PDF 다운로드.
- 웹·작업자 재시작 후 paid 상태와 저장 보고서 JSON 해시 유지.
- non-root, 읽기 전용 root filesystem, 외부 공급자 자격증명 미전달, web/worker probes.
- 모바일 Chromium으로 랜딩 → 입력 폼 이동, 가로 넘침 없음, 외부 요청 없음.

기계 판독 결과: [local-runtime-test.json](local-runtime-test.json). API 테스트는 컨테이너 안에서 실행하고 host loopback도 별도로 확인한다. 실제 PG·AI 생성·이메일 수신 테스트가 아니다.

재현용 자격증명은 저장소 제외된 새 파일에 다음처럼 생성한다. 같은 이름의 기존 파일을 덮어쓰지 않는다.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
fs.mkdirSync('var/runtime', { recursive: true, mode: 0o700 });
const names = ['DATA_KEY', 'AUTH_SECRET', 'ADMIN_PASSWORD', 'ADMIN_TOTP_SECRET'];
const lines = names.map(name => name + '=' + crypto.randomBytes(name === 'ADMIN_TOTP_SECRET' ? 20 : 32).toString('hex'));
fs.writeFileSync('var/runtime/synthetic.env', lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
JS
docker compose --env-file var/runtime/synthetic.env -f compose.local.yml -p gumseo-runtime-smoke up -d --no-build
npm run test:runtime
docker compose --env-file var/runtime/synthetic.env -f compose.local.yml -p gumseo-runtime-smoke down
```

실행 환경은 디스크 여유가 필요하다. 현재 Docker VFS 환경은 이미지/컨테이너의 파일 복사 비용이 컸고 테스트 중 용량 부족이 발생했다. 이 작업에서 만든 컨테이너와 사용하지 않는 빌드 캐시를 정리한 후 재검증했다. 실제 서버의 디스크·백업 용량 경보와 스토리지 드라이버 선정은 남아 있다.
