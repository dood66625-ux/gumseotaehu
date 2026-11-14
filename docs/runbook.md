# 로컬 운영/장애 복구

## 시작과 이식
Node24, npm ci/setup/build/start + 별도 worker. 동일 cwd와 var 볼륨, 같은 DATA_KEY/AUTH_SECRET 사용. 서버를 옮길 때 소스·lockfile·assets와 SQLite 일관 백업, **별도로 보관한 키**를 이관한다. 도메인/메일/PG 실제 전송과 공개 배포는 별도 승인 전 금지. APP_MODE local 외는 거부한다.

## 장애
- 공개 `/`는 DB/키/워커 장애에도 정적 렌더링. 개인화 API 오류는 고객센터/재열람 경로 안내.
- PG 성공 후 창닫기/앱확정 실패: 워커 reconcile()이 pg_ledger DONE를 조회→paid+job을 같은 트랜잭션에 생성. 추가 청구하지 않는다.
- 생성 실패: worker 지수 backoff4회→failed+감사 alert. 관리자에서 유료 결제 유지 확인 후 재시도 또는 전액 mock 환불. 결제 상태를 pending으로 되돌리지 않는다.
- 워커 중단: 다시 npm run worker. 만료60초 lease를 회수한다. order/version UNIQUE로 결과 중복 방지.
- PDF 오류: 보고서 접근은 유지. PDF 다운로드만 재시도. stored JSON에서 다시 렌더링하므로 AI를 재호출하지 않는다.
- 메일 미수신: 로컬에서는 실제 발송 없음. 이메일 인증 시험 경로로 같은 원문 복구. 주소 변경은 자동으로 승인하지 않는다.
- PG 취소 실패: refund_pending+refund error 유지. 관리자 실패 체크 해제 후 재실행, PG 취소 대사 확인. 완료 전 고객에게 환불 완료 통지 금지.
- 개인정보 삭제: 인증 고객 privacy 문의→운영자 본인확인/주문 대조→삭제 업무. 원문 전 버전 파기·재생성 차단, 거래 보존 분리.

## 백업·복구
`npm run backup`은 SQLite backup API로 WAL을 포함한 일관 스냅샷을 만든 후 AES-256-GCM으로 파일 전체를 암호화하여 `var/backups/*.gsb`로 저장한다. 파일 권한은 0600, 임시 디렉터리는 0700이다. 임시 평문 스냅샷은 작업 종료 시 삭제한다. 삭제는 저장매체의 보안 소거를 보장하지 않으므로 디스크 암호화가 별도로 필요하다.

```sh
npm run backup
# source archive and NEW offline destination; never point at the live database
npm run privacy:export -- var/privacy/latest-<id>.json
npm run restore -- var/backups/<archive>.gsb var/recovery/check.sqlite --deletions var/privacy/latest-<id>.json
```

복구는 같은 DATA_KEY가 필요하다. 잘못된 키/변조된 파일, 기존 목적지 또는 WAL/SHM/journal 파일이 있으면 거부한다. 복호화 후 SQLite integrity_check 및 foreign_key_check를 통과한 새 파일만 제공한다. 실행 중인 DB를 교체하거나 서버/워커를 시작하지 않는다. 현재 파일 크기 상한은 64MiB이며 더 큰 DB에는 스트리밍/대용량 백업 구현이 필요하다.

장애 복구 시 먼저 서버/워커를 중지하고 원본 DB와 키를 별도로 보존한다. 새 파일로 복구·검증한 후 담당자가 DB 경로 변경과 재기동을 수행한다. DATA_KEY 외에 기존 AUTH_SECRET 등 인증 키도 별도로 보관한다. 자동 테스트에서 실제 앱의 가상 결제 주문·암호화 보고서를 백업/복원하여 paid 상태와 복호화 원문 일치를 확인한다. 운영 디스크 암호화, 보존기한/삭제 전파, 외부 오프사이트 백업과 실인프라 재해복구 훈련은 별도 구축해야 한다. 기존 평문 .sqlite 백업은 자동 변환·삭제하지 않는다.

DATA_KEY 교체는 오프라인 새 사본 생성으로 지원한다. 서버/워커를 중지한 후 최신 삭제 목록을 내보내고, Git 제외된 비공개 새 키 파일을 생성한다.

```sh
npm run key:generate -- rotation-local
npm run key:rotate -- var/recovery/rekey.sqlite --new-key-file var/keys/rotation-local.key --deletions var/privacy/latest-<id>.json --offline
```

원본 DB/.env.local은 바꾸지 않으며 새 사본의 모든 암호화 JSON 필드를 재암호화하고 세션/인증 요청을 폐기한다. 주문과 보고서 원문을 새 키로 확인한 후 담당자가 키와 DB 경로를 함께 전환해야 한다. AUTH_SECRET은 유지하므로 이메일 HMAC/식별자는 보존한다. AUTH_SECRET 변경·관리자 비밀번호/MFA 자격증명 회전은 이 명령의 범위가 아니다. 이전 암호화 백업에는 이전 DATA_KEY가 필요하므로 키를 별도로 보관한다. 새 삭제 목록도 새 키로 서명하여 사본 옆에 제공한다. 이 기능은 키 관리 서비스나 실 인프라 복구 훈련의 대체가 아니다.

이전 DATA_KEY의 백업을 현재 키 환경으로 복구하려면 아래 선택 인자를 사용한다. 최신 삭제 목록의 서명은 현재 DATA_KEY로 확인하며, 과거 키는 백업/필드 복호화에만 쓰고 새 사본은 현재 키로 다시 암호화한다.

```sh
npm run restore -- var/backups/<old-archive>.gsb var/recovery/current-key.sqlite --deletions var/privacy/latest-<id>.json --archive-key-file var/keys/old-data.key
```

삭제 복구 주의: 복구 CLI는 최신 서명 삭제 목록을 필수로 요구한다. 목록의 서명만 검증하며 '가장 최신인지'를 자동 증명하지는 못한다. 담당자가 원본 DB의 최신 목록을 별도로 안전하게 보관해야 하며, 오래된 목록/빈 목록을 사용하면 과거 삭제가 누락될 수 있다. 오프사이트 삭제 이력 동기화·법적 보류·백업 기한 파기는 출시 전 추가 구현 항목이다.

## 브라우저 의존성
보통 `npx playwright install --with-deps chromium webkit`. 현재 클라우드는 root/sudo/시스템 패키지 도구가 없어서 공식 Debian trixie 패키지를 work 아래 추출하고 WebKit용 실행 wrapper가 로컬 라이브러리 경로를 추가한다. `WEBKIT_EXECUTABLE`로 wrapper를 지정할 수 있다. 현재 증거는 실제 WebKit 엔진 실행이며 실제 iPhone Safari 검증이 아니다. 런타임 dependency validation을 생략한 경우 실제 launch·렌더링·E2E 성공 증거로 확인한다. 일반 개발자는 해당 우회 없이 표준 설치를 권장한다.

## 출시·롤백
실 운영은 차단되어 있다. 운영자 승인과 미구현 항목 완료 후: 별도 스테이징→PG sandbox/실 API 품질·보안·성능→백업/마이그레이션→승인된 공개 배포. 롤백은 이전 코드/호환 스키마+백업 기준, PG 원장은 되돌리지 않고 대사하여 이미 승인된 돈을 누락하지 않는다.

## 메일 복구 주의
복구 사본의 세션/인증 요청은 모두 폐기하며 메일은 조회 전 보류한다. 실제 공급자 계정과 최신 억제/변경 이력을 확인한 뒤 독립적으로 대사해야 한다. 이미 업체에 접수된 메일을 다시 발송하거나 멱등 보존 기간 밖의 미확인 메일을 자동 재시도하지 않는다. DATA_KEY 교체에도 메일 수신 주소/본문/문의 연락처 암호화가 포함된다. 상세: mail-delivery-integration.md. 현재 실제 공급자/worker 등록은 없으므로 이 코어를 실행해 실메일을 보낼 수 있다는 안내를 하지 않는다.
