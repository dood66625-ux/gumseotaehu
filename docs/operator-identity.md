# 단일 운영자 인증 등록·분실 복구·회수

2026-11-21. 코드와 오프라인 절차를 준비했으며 실제 서버의 비밀번호·MFA seed·서명 키를 변경하지 않았다. 실제 운영 기기 등록/공개 HTTPS 로그인/호스트 복구 훈련은 출시 인수에서 별도 확인한다. 여러 운영자 계정을 초대·관리하는 기능은 아니다.

## 관리자 세션과 고객 세션 분리

정상 비밀번호+TOTP 로그인 후 `ad1` 관리자 쿠키를 발급한다. 랜덤 nonce와 현재 origin/관리자 비밀번호/MFA seed를 기존 AUTH_SECRET으로 HMAC 서명한다. DB에는 기존처럼 전체 쿠키의 해시만 저장하며 비밀번호·MFA seed를 새 테이블에 저장하지 않는다. HTTP 요청의 sessionFor가 현재 서명과 DB 권한/만료를 확인한다. 비밀번호·MFA seed·origin 변경 후 이전 관리자 쿠키는 거부되며, 운영자 전체 세션 회수 API는 기존처럼 DB 세션을 삭제한다. TOTP 재사용 금지·최근10분 MFA·역할 검사는 유지한다.

이 버전 배포 시 이전 형식의 관리자 쿠키는 재로그인이 필요하다. 고객 쿠키는 기존 형식을 유지한다. 관리자를 customer로 강등한 뒤에도 관리자 쿠키를 고객 쿠키로 재사용할 수 없다. 메모리/이미 저장된 화면의 원격 삭제를 보장하는 것은 아니며 다음 보호 API 요청에서 접근을 차단한다.

`npm run admin:code`는 HTTP loopback 개발 환경에서만 코드를 출력한다. HTTPS 운영 호스트 또는 운영 결제 승인이 있는 환경에서는 고정 오류코드만 출력하고 OTP를 표시하지 않는다. 실제 운영은 인증 앱에 등록한 TOTP를 사용한다.

## 오프라인 최초 등록 또는 MFA 기기 분실 복구

**아래는 운영 준비 후 정해진 점검 시간에 실행하는 절차다. 현재 작업에서는 실행하지 않았다.** 기존 고객 세션 키·암호화 키·토스/메일/AI 키와 활성화 플래그를 보존한다. 초기 등록과 기기 분실 복구는 서버 파일을 관리하는 소유자 권한으로 새 비밀번호와 MFA seed를 발급하는 같은 절차이며 공개 웹의 MFA 우회/복구 API는 없다.

전제: 운영 APP_ORIGIN이 canonical HTTPS이고 실제 설치 Compose도 동일 origin을 사용해야 한다. 현재 로컬 모의 Compose의 origin을 이 도구가 공개 운영값으로 변경하지 않는다. 운영 도메인/프록시/승인은 별도 검증한다. 대상은 일반 앱 env이며 toss-sandbox.env/private-reader.env는 거절한다. 대상 env는 소유자 전용 일반 파일, 단일 링크이고 단순한 NAME=value 형식이어야 한다.

1. 새 자동 업데이트를 멈춘다. 진행 중인 업데이트 서비스를 강제 종료하지 않고 끝날 때까지 기다려 inactive인지 확인한다.

```bash
sudo systemctl stop gumseo-private-update.timer gumseo-private-update-notify.path
systemctl show gumseo-private-update.service -p ActiveState -p SubState -p Result
```

2. 일반 앱 web/worker를 멈춘다. 볼륨을 삭제하거나 다른 비공개 reader 서비스를 중지하지 않는다.

```bash
sudo docker compose --env-file /etc/gumseo/test.env -f /usr/local/lib/gumseo/compose.local.yml stop web worker
sudo install -d -o root -g root -m 700 /etc/gumseo/operator-enrollment
```

3. 검토한 소스에서 새 파일명으로 실행한다. 기존 등록 파일을 덮어쓰지 않는다.

```bash
cd /opt/gumseo/source
sudo python3 deploy/iwinv/provision-operator.py --env-file /etc/gumseo/test.env --provision-file /etc/gumseo/operator-enrollment/enrollment-NEW.json --offline
```

도구는 자동 업데이트 timer/path/service 비활성 및 고정 Compose의 실행 컨테이너 부재를 확인하고 자동화 잠금을 유지한다. env의 ADMIN_PASSWORD·ADMIN_TOTP_SECRET만 교체한다. password는192bit 랜덤, MFA seed는160bit 랜덤이며 AUTH_SECRET/DATA_KEY/공급자 키/활성화 값은 그대로 둔다. 새 비밀번호·base32 등록키·SHA1/6자리/30초 otpauth URI는0600 등록 파일에만 기록한다. 터미널·로그에는 자격증명 값을 출력하지 않는다. 파일은 작업 트리 밖의0700 개인 디렉터리여야 한다.

4. 보안된 관리 기기에서 비공개 파일을 읽어 비밀번호를 금고에 저장하고 인증 앱에 URI 또는 base32 등록키를 입력한다. 파일/키/코드를 채팅·메일·GitHub로 보내지 않는다. 비밀번호와 인증 기기를 분리해 관리하고 등록 완료 후 임시 등록 파일의 보관/삭제를 결정한다. 일반 unlink가 저장매체의 보안 소거를 뜻하지는 않는다.

5. env를 다시 읽도록 컨테이너를 재생성하고 health/로그인·OTP 재사용 차단을 확인한다. Docker restart만으로는 env가 갱신되지 않는다.

```bash
sudo docker compose --env-file /etc/gumseo/test.env -f /usr/local/lib/gumseo/compose.local.yml up -d --no-build --no-deps --force-recreate web worker
```

새 관리자 로그인 후 이전 관리자 쿠키의 보호 API 접근이 거부되고 고객 쿠키/기존 주문은 유지되는지 확인한다. 필요 시 관리자 전체 세션 회수를 사용한다. OTP를 이미 썼으면 다음30초 코드를 기다린다. 확인을 마친 후에만 예비 갱신을 재개한다.

```bash
sudo systemctl start gumseo-private-update-notify.path gumseo-private-update.timer
```

## 실패 시 조치

WAIT_FOR_AUTOMATION_LOCK은 진행 중인 배포/백업이 끝나기를 기다린다. ENV_FILE_OUTSIDE_WORKTREE_REQUIRED / PROVISION_FILE_OUTSIDE_WORKTREE_REQUIRED는 체크아웃 밖의 개인 경로를 사용한다. STOP_AUTOMATIC_UPDATES_FIRST는 timer/path를 중지하고 기존 서비스 종료를 기다린 뒤 확인한다. STOP_MAIN_WEB_AND_WORKER_FIRST는 고정 Compose의 일반 앱을 중지한다. OPERATOR_HTTPS_ORIGIN_REQUIRED는 운영 origin/Compose 준비 전이라 거부된 것으로, 이 도구로 HTTPS나 실결제를 활성화하지 않는다. PRIVATE_* / PLAIN_* 오류는 로컬 파일의 소유권·권한·형식을 점검한다. 이미 존재하는 등록 파일은 덮어쓰지 않고 새 이름을 사용한다.

등록 파일을 먼저 fsync한 뒤 env를 원자적으로 교체한다. 교체 전 실패는 기존 env를 보존하고 사용하지 않은 새 파일을 제거한다. 교체 후 디렉터리 fsync 실패는 ADMIN_PROVISIONING_COMMIT_UNCERTAIN이며 등록 파일을 남긴다. 이때 자동 재실행/옛 키 복원으로 덮어쓰지 말고 두 비공개 파일의 일치 여부를 소유자가 로컬에서 점검한다. 실제 서비스가 계속 정지했는지 확인한 뒤 처리한다. env에 다른 수정이 감지돼도 임의 덮어쓰지 않는다.

서버/관리 기기 자체를 모두 잃었다면 별도 암호화 백업·DATA_KEY·호스트 소유권 복구가 먼저 필요하다. 이 도구는 SSH 접근 복원이나 저장매체 장애 복구를 대신하지 않는다.

## 검증

가짜 설정과 임시 파일에서 관리자 두 항목만 변경·base32/hex seed 일치·0600·기존 파일/심볼릭 링크 거절·공개 권한/HTTP 거절·원자 교체 실패의 원본 보존·불확실 commit의 등록 파일 보존·작업 트리 내 비밀파일 작성 거절·실행 중 업데이트/컨테이너 차단7개를 검증했다. 관리자 서명 변조·비밀번호/MFA/origin/서명 키 교체·고객 세션 유지와 운영 OTP 개발 도구 출력 차단도 검증했다. 기존 로그인/전역 TOTP 재사용 차단/권한 회수를 모바일·PC Chromium에서 실제 로컬 API로 확인했다. 실제 서버 등록/회전·운영 OTP·실결제/메일/AI 요청은 수행하지 않았다.
