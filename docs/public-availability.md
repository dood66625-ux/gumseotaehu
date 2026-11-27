# 상용 사이트 외부 가용성 점검

2026-11-28 KST. 실제 판매 경로로 전환한 뒤에도 기존 감시가 심사용 /build-info.json을 검사하고 있었다. 해당 주소가404로 바뀌면서 최근 감시 실행은 계속 실패했고, 실제 상용 메인/입력/재열람은 정상 응답하는 불일치를 확인했다. 감시 대상을 실제 판매 경로로 수정했다.

`npm run monitor:public`은 다음 고정 HTTPS GET만 수행한다. 인증키·쿠키·SSH를 쓰지 않으며 결제/AI/메일 공급자를 호출하지 않는다.

| 확인 대상 | 기대 결과 | 실제 읽기 전용 확인 |
|---|---|---|
| https://gumseo.kr/ | 상용 메인·사주 펼쳐보기·입력 링크, 체험 결제 문구 없음 | 200·통과 |
| https://gumseo.kr/start | 출생정보 입력 폼 | 200·통과 |
| https://gumseo.kr/recover | 구매 이메일 인증 재열람 페이지/앱 정적 경로 | 200·통과 |
| https://gumseo.kr/site.css | 판매/입력/운명서 스타일 | 200·통과 |
| https://gumseo.kr/.env | 접근 차단403/404 | 404·통과 |
| https://gumseo.kr/.git/config | 접근 차단403/404 | 404·통과 |
| https://gumseo.kr/api/admin/export | 비로그인 접근 차단401/403/404 | 401·통과 |

정상 페이지는 MIME·nosniff·HSTS와 화면별 표시를 확인한다. HTML256KiB/CSS1MiB·10초 상한, 잘못된 UTF-8·리디렉션·오류 응답을 실패 처리한다. 보호 경로는 상태만 확인하며 예상치 못한200 응답이라도 본문을 읽지 않고 취소한다. 출력은 고정 대상ID·숫자HTTP상태·허용된 결과 코드뿐이며 원문/예외/고객 정보를 남기지 않는다.

결과 healthy는 공개 판매 화면/정적 자산/기본 접근 차단을 의미한다. 내부 앱·worker·DB·디스크·백업 최신성·실제 공급자 동작과 알림 수신을 검증했다고 주장하지 않는다. privateHostVerified/backupFreshnessVerified/providerOperationsVerified/alertDeliveryVerified는 false를 유지한다. 실제 활성 서비스에 customerMailEnabled=false라고 잘못 표시하던 과거 필드는 제거했다.

## 실행과 알림 범위

`.github/workflows/public-availability.yml`은 기존 매시17/47분(약30분 간격) 예약을 유지한다. 실패 시10초 간격으로 최대3회 재확인하고 모두 실패해야 실패 상태가 된다. GitHub 실행 시간/계정 알림 설정의 영향을 받으므로 정확한 실행 시각이나 메일 수신 SLA를 보장하지 않는다. 예약을 추가해 실행량을 늘리지 않는다.

정상 점검의 수동 실행은 아래 명령으로 가능하다. 이 작업에서는 정상 실행만 확인하며 알림 전달 시험을 고의로 실행하지 않는다.

```bash
gh workflow run public-availability.yml --repo dood66625-ux/gumseotaehu -f test_alert=false
```

기존 test_alert=true는 별도 ALERT DELIVERY TEST - no service outage 이름으로 감시 전에 의도적으로 실패하는 선택 기능이다. 실패 기록 자체는 이메일 수신 증거가 아니며 운영자 수신 확인이 필요하다. 이번 변경으로 설정을 활성화하거나 시험 메일을 보내지 않았다. 알림 설정: https://github.com/settings/notifications .

## 검증과 남은 항목

고정 대상/무인증·쿠키 생략, 상용 화면/스타일 검사, HTTP/MIME/보안 헤더/크기/UTF-8/예외/체험 화면 거절, 보호 경로의 예상 밖200 본문 미열람13개 단위 검사와 실제 HTTPS7개 검사를 통과했다. 재열람의 실제 결제 주문에도 모의라고 표시하던 문구도 livePayment에 따라 구분하도록 수정했다. 실제/모의 구분과 환불·삭제·만료·재열람 권한18개 브라우저 조건, 프로덕션 빌드 통과. 공급자 요청0회.

5.1.4의 실제 호스트 복구·상시 외부 알림 수신, 5.3.3의 운영 IP/WAF/제한 연결은 별도다. 이번 공개 HTTP 검사로 완료 처리하지 않으며 **44/56(78.6%)·12개 남음**을 유지한다.

## 실제 외부 실행 확인

2026-11-28 KST에 새 커밋6fa900a의 정상 workflow_dispatch(test_alert=false)가 GitHub hosted runner에서 성공했다. [실행46022994301](https://github.com/dood66625-ux/gumseotaehu/actions/runs/46022994301). 로컬 검사와 별개의 외부 실행 성공이며 의도적인 실패 알림 시험은 수행하지 않았다. 알림 수신/백업/내부 worker 검증 완료를 뜻하지 않는다.

## 이전 기록

2026-11-22에는 심사용 assets metadata와 pay.gumseo.kr/health 두 대상의 정상 응답을 확인했다. 상용 서비스 전환 후에는 이 결과를 실제 판매 경로의 현재 상태로 사용할 수 없다. 과거 알림 전달 시험과 운영자 수신 미확인은 그대로 구분해 보관한다.
