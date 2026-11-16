# 실제 토스 테스트 결제 전용 환경

운영 사이트와 분리된 고정 가상 주문 한 개만 처리한다. 테스트 결제 위젯 키(`test_gck_`/`test_gsk_`)만 받으며 실서비스 키는 거부한다. 메인 앱 결제/AI/메일을 활성화하지 않는다. 이 문서는 실제 승인/환불 완료 증거가 아니다.

## 구현·검증

- `dist/toss-sandbox.js`는 기존 SDK 시험 서버를 번들한 것이다. 메인 worker가 자동으로 실행하지 않는다.
- 별도 Compose의 sandbox는 Linux 호스트 네트워크에서 **127.0.0.1:3211만** 수신한다. 외부 포트를 개방하지 않으며 브라우저는 SSH 터널로 연결한다.
- `/var/lib/gumseo-toss`를 `/app/var`로 연결한다. 메인 앱 DB·키·고객 입력을 사용하지 않는다. 별도 테스트 설정은 `/etc/gumseo/toss-sandbox.env`, 권한 600이다.
- 설정 도구는 테스트키 종류·개행 삽입을 검사하고 기존 설정을 덮어쓰지 않는다. 키는 서버의 대화형 터미널에서 숨겨 입력하며 GitHub/대화/스크린샷으로 보내지 않는다. 키 모양 검사는 실제 상점 연결 검증을 의미하지 않는다.
- 고정 고객의 보고서는 모의 해석이다. 실제 AI는 호출하지 않는다. 결제 승인 상태는 서버에서 토스 조회 결과와 금액/MID/주문을 검증한다. 실제 카드사 인증은 운영자가 직접 수행해야 한다.

## 서버 준비

새 이미지가 자동 업데이트된 후:

```bash
cd /opt/gumseo/source
git pull --ff-only
python3 deploy/iwinv/setup-toss.py
sudo install -d -m 700 -o 1000 -g 1000 /var/lib/gumseo-toss
sudo docker compose -f deploy/iwinv/compose.toss.yml up -d --no-build
sudo docker compose -f deploy/iwinv/compose.toss.yml ps
```

테스트키가 없으면 설정 단계에서 중단한다. 키를 다시 발급하거나 운영 키를 대신 사용하지 않는다. 기존 파일이 있다면 그 내용을 출력하지 말고 설정 여부부터 확인한다.

Windows PowerShell 새 탭:

```powershell
ssh -N -L 3211:127.0.0.1:3211 gumseo@115.68.223.204
```

브라우저: `http://127.0.0.1:3211`. 실서비스 결제를 이용하지 않는다. 테스트임을 화면에서 확인한 후 운영자가 직접 결제 인증을 진행한다. 승인 후 조회·PDF·재접속·관리자 인증 후 전액 취소를 각각 검증하고 증거에는 결제키·카드정보·키·암호를 남기지 않는다.

정지: `sudo docker compose -f deploy/iwinv/compose.toss.yml down` (볼륨/호스트 데이터 삭제 옵션 없음). 재시작 자동화·메인 서버 monitor 대상에는 포함하지 않는다. 시험 완료 후 정지한다.

현재 검증: 관련 TS 테스트 49개, 설정 Python 테스트 2개, 타입 검사, 번들 서버의 가짜키/별도 DB/외부 fetch 차단 상태 기동과 HTTP 응답 확인. 모바일 Chromium의 전액 취소/복구 브라우저 계약 검사 통과. 이 개발 환경의 WebKit은 OS 공유 라이브러리가 없어 실행하지 못했고 의존성 설치도 root 권한이 없어 실패했다. 실제 PG 인증/승인/취소는 아직 미검증이다.
