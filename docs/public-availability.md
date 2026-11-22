# 외부 가용성 점검 준비

2026-11-22. `npm run monitor:public`은 고정 HTTPS GET 두 건으로 공개 assets metadata와 분리 결제 심사 서버 health를 확인한다. 리디렉션·HTTP 오류·잘못된 JSON/스키마·4KiB 초과·10초 지연을 실패로 취급한다. 인증키/쿠키/SSH/메일 API/고객 정보는 사용하지 않고 원문 응답·예외도 출력하지 않는다.

실제 두 대상 정상 응답과 관련6개·타입 검사를 확인했다. `.github/workflows/public-availability.yml`은 수동 실행과 매시17/47분(약30분 간격) 예약 점검을 선언한다. 실패 시10초 간격으로 최대3회 확인하고 모두 실패해야 workflow를 실패 처리한다. 사용자에게 권장한 GitHub 알림 경로로 진행했으며 실제 알림 수신은 계정 설정/수신 확인이 필요하다. GitHub hosted runner는 Windows PC와 별개로 실행되지만 예약 실행 시간 보장/SLA가 있는 유료 모니터링은 아니다.

이 검사는 공개 HTTPS와 심사 프로세스의 응답 확인에 한정한다. 내부 앱/worker/DB·비공개 reader·디스크·백업의 최신성은 보장하지 않는다. 기존 root monitor와 외부 백업 검증을 대체하지 않으며 정상 HTTP를 운영 출시/데이터 무결성의 증거로 사용하지 않는다. 내부 health를 공개하거나 검증 플래그를 true로 바꾸지 않았다. 상시 내부 경보와 외부 사본 최신성 조건이 남으므로 총40/56=71.4%,16개 남음 유지.

## 알림 확인

GitHub의 Settings → Notifications → Actions에서 workflow 알림과 원하는 이메일/웹 수신을 확인한다: https://github.com/settings/notifications . GitHub Actions 실패 상태는 알림 수신 성공을 증명하지 않는다. 수신 여부를 확인하기 위해 실제 서비스를 중단하거나 거짓 정상 결과를 만들지 않는다. 공개 가용성 점검은 OpenAI/Resend/실결제 요청을 하지 않지만 GitHub Actions 실행 시간을 사용한다. 계정의 사용량/예산 제한, 예약 지연/중지와 알림 설정의 영향은 남는다. 예약 선언/수동 실행 성공을 실제 예약 실행 또는 수신 검증으로 바꾸어 기록하지 않는다.
