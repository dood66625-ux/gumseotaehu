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
`npm run backup`은 Node SQLite backup API로 WAL 포함 일관 스냅샷을 var/backups에 만든다. 암호화 키 없이는 payload 복구 불가. 운영 디스크/백업 파일 자체 암호화·접근권한·보존기간은 별도 구축한다. 중단 복구 시험: web/worker 종료→현재DB 별도 보관→백업 복사→기존 DATA_KEY/AUTH_SECRET로 기동→주문/보고서 동일 확인. 자동 테스트에서 일관 백업을 새 연결로 열고 결제 상태·복호화 본문 동일성을 확인한다. 이는 실인프라 DR 훈련을 대체하지 않는다.

키 교체는 기존 데이터 전체 decrypt→새 키 encrypt 재암호화·HMAC 인덱스 재산출·기존 세션 폐기와 검증이 필요하다. 현재 자동 키 회전은 미구현이며 단순 env 키 변경을 하지 않는다.

## 브라우저 의존성
보통 `npx playwright install --with-deps chromium webkit`. 현재 클라우드는 root/sudo/시스템 패키지 도구가 없어서 공식 Debian trixie 패키지를 work 아래 추출하고 WebKit용 실행 wrapper가 로컬 라이브러리 경로를 추가한다. `WEBKIT_EXECUTABLE`로 wrapper를 지정할 수 있다. 현재 증거는 실제 WebKit 엔진 실행이며 실제 iPhone Safari 검증이 아니다. 런타임 dependency validation을 생략한 경우 실제 launch·렌더링·E2E 성공 증거로 확인한다. 일반 개발자는 해당 우회 없이 표준 설치를 권장한다.

## 출시·롤백
실 운영은 차단되어 있다. 운영자 승인과 미구현 항목 완료 후: 별도 스테이징→PG sandbox/실 API 품질·보안·성능→백업/마이그레이션→승인된 공개 배포. 롤백은 이전 코드/호환 스키마+백업 기준, PG 원장은 되돌리지 않고 대사하여 이미 승인된 돈을 누락하지 않는다.
