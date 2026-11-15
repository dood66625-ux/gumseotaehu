# 이메일 공급자 어댑터: Resend 후보

2026-11-15. 실제 계정·키·발신 도메인을 연결하지 않았다. 공급자 후보용 HTTP 어댑터를 구현했으며 업체 선택/계약 확정을 의미하지 않는다. 앱/worker 기본 공급자는 계속 disabled이다. 환경변수나 키만 추가해도 발송되지 않는다. 실제 고객정보 국외이전/처리위탁·발신 설정·실발송 승인은 별도로 필요하다.

## 구현과 경계

- 고정 `https://api.resend.com`의 발송 POST와 이메일 ID 조회 GET만 생성한다. 리다이렉트 차단, 10초 요청 제한, AbortSignal 전달, 응답 128KiB 제한, 오류 본문/주소/인증번호/키 비노출을 적용했다.
- 명시적으로 생성·활성화한 어댑터만 통신할 수 있다. 현 런타임에는 등록하지 않았다. 자격증명 형식 검사는 실제 유효성 검증이 아니다.
- 발송 계정 범위를 구분하는 고정 `accountScope`를 이름에 포함한다. 실제 계정과의 연결은 설정 담당자가 확인해야 하며 같은 scope를 다른 계정에 재사용하면 안 된다.
- 수신자는 1명이며 기존 거래용 렌더러가 만든 envelope만 전달한다. 헤더 개행, 첨부파일·추가 필드, 과대 본문을 거부한다. 출생정보·차트·운명서 본문/PDF를 추가하지 않는다.
- 고정 Idempotency-Key와 동일한 `gumseo_key` tag를 보낸다. 조회 시 이메일 UUID와 tag를 함께 대조한다. 공식 멱등키 보존 기간은 24시간이며 어댑터도 그 범위를 명시한다.
- POST 성공은 공급자 접수까지만 의미한다. GET에서 명시적 delivered를 확인해야 전달로 표시한다. opened/clicked를 고객 열람이나 전달 확정 증거로 쓰지 않는다.
- ID를 잃어버린 승인 응답 누락은 멱등키 조회 계약이 없으므로 unknown으로 남긴다. 미발송이라고 추정하거나 새 키로 자동 재발송하지 않는다. 기존 코어는 조회 실패 후 운영 검토로 넘긴다. 이 제한을 해결한 완전 자동 복구라고 표시하지 않는다.
- 404/409/429/서버 오류도 미접수 증거가 아니다. bare bounced/failed만으로 영구 반송이라고 단정하거나 수신 주소를 전역 차단하지 않는다. 구조화된 반송 사유와 서명 웹훅 검증은 후속 구현이 필요하다. complained는 ID/tag가 일치한 독립 조회에서만 반영한다.

## 검증

사용량을 줄이기 위해 이번 변경과 직접 관련된 두 테스트 파일만 실행했다. 타입 검사와 47개 테스트 통과. 고정 URL/envelope/멱등키, 접수·전달 구분, 응답 누락 시 재발송 금지, 태그 불일치, HTTP 오류 비노출, 과대 응답, 취소 신호, 기존 DB 큐→어댑터→접수→독립 조회→전달 흐름을 시험했다. 공급자 요청은 모두 가짜 fetch로 가로챘다. 실제 메일·DNS 검증·받은편지함 수신 시험이 아니다. 고객 UI/라우트 변경이 없어 전체 E2E와 전체 테스트를 반복하지 않았다.

## 실제 연결에 남은 것

사용할 도메인·업체 계정과 발신 주소, SPF/DKIM/DMARC 및 DNS 소유 확인, 계정 scope 확인, 처리위탁/국외이전 검토, 서명된 반송/불만 HTTP 수신기, 실제 worker 등록과 로컬 OTP 공개 경로 제거가 필요하다. 실제 발송 승인을 받은 뒤 소유자가 지정한 시험 수신함에서 먼저 인증·주문/보고서 링크·재열람을 확인해야 한다. 현재 Gmail 문의 주소와 자동 거래 메일 공급자는 별개다. 키나 인증번호를 대화로 전달하지 않는다.

공식 문서 확인:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/emails/retrieve-email
- https://resend.com/docs/dashboard/emails/idempotency-keys


## 서명 웹훅 수신기 추가

`/api/mail/webhook`은 기본 503이며 본문이나 DB를 읽지 않는다. 개발용 수신을 명시적으로 구성할 때만 `RESEND_WEBHOOK_MODE=receipt-only`, `RESEND_WEBHOOK_SECRET`, `RESEND_ACCOUNT_SCOPE`, `TRANSACTION_MAIL_SENDER`, `TRANSACTION_MAIL_REPLY_TO`를 사용한다. origin은 기존 APP_ORIGIN을 사용하며 발송 profile/계정 scope가 같아야 기존 기록에 연결된다. API 발송 키는 수신기에서 필요하지 않고 공급자 GET/POST도 실행하지 않는다. 실제 업체 endpoint 등록이나 운영 공개 승인을 대체하지 않는다.

공식 Svix 2.10.0 라이브러리로 원본 바이트의 `svix-id`/timestamp/signature를 검증한다. v2 verify는 파싱한 이벤트를 반환하지 않으므로 검증 후 JSON을 명시적으로 파싱한다. 서명 회전, 기본 ±5분 시각 검증, 본문 64KiB/전체 읽기 3초, 헤더 4KiB 제한을 적용했다. 본문·수신 주소·반송 사유 원문은 저장하지 않는다. 실패 응답은 정해진 오류 코드만 반환한다.

서명이 맞아도 delivered/bounced/complained 주장을 원장에 직접 반영하지 않는다. 이미 profile/공급자 ID가 결합된 메일의 독립 조회만 예약하고, 메시지 ID 중복은 기존 DB 코어에서 제거한다. 알 수 없는 메일 ID는 연결하지 않는다. 따라서 최초 발송 응답을 잃어 ID를 모르는 건의 자동 복구는 여전히 미완료다. 서명 수신만으로 영구 반송 처리 전체가 완료되는 것도 아니다. Resend GET의 bare bounced는 기존 어댑터에서 unknown으로 남기므로 운영 검토가 필요하다.

타입 검사와 관련 이메일 테스트 57개 통과. 독립 HMAC fixture, Unicode/바이트 변경, 재전송 시간, 변조·잘못된 키, 다중 서명, 과대/지연 본문, 기본 HTTP 차단, 중복 알림→독립 조회→상태 갱신을 검증했다. 외부 요청은 가짜 공급자만 사용했고 실제 메일 발송·endpoint 등록·고객정보 전송은 하지 않았다. 전체 테스트·전체 E2E는 반복하지 않았다.

공식 검증 안내: https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
