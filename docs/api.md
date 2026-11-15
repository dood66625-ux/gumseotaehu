# 로컬 API
모든 응답은 private,no-store/noindex. mutation은 JSON≤16KB+Origin 정확 일치+세션 요구. `/session`만 익명 생성. 인증은 HttpOnly cookie. 외부 PG webhook을 받는 운영용 엔드포인트가 아니다.

| 메서드/경로 (/api 접두사) | 기능/권한 |
|---|---|
| POST session,logout | 세션 생성/종료 |
| POST readings / GET readings/:id | 검증·계산 저장/원 세션 무료 조회 |
| POST auth/request,auth/verify | email / challengeId,code;15분/5회/단일사용 |
| GET local-mail/:challenge | 원 요청세션 mock OTP; 공개 운영 금지 |
| POST orders | readingId,consent;인증+19+;서버22000원 |
| GET orders,orders/:id | 인증 이메일 소유 주문만 |
| POST payments/authenticate | orderId,scenario;로컬PG원장 인증 |
| POST payments/confirm | orderId,paymentKey,amount;로컬PG원장 조회 대조 |
| POST payments/webhook | 무신뢰 알림;로컬 원장 대사만;외부웹훅 미지원 |
| GET reports/:id,/pdf | 이메일소유+paid+ready+1년+미삭제 |
| POST resend | orderId;로컬 outbox |
| POST/GET tickets | 인증본인 문의 접수/답변 조회 |
| POST admin/login | password+code;로컬 단일 운영자 MFA |
| GET admin,/export | 서버 role 검사;비식별 원장/CSV |
| POST admin/refund | orderId,reason[,testFailure];운영·정산 role |
| POST admin/retry,/correct,/delete | 운영 role;정정 input+reason / 삭제ticketId+reason |
| POST admin/resend,/answer | CS role 포함;이메일 로컬재발송/문의답변 |
| GET health | local-mock/launchReady:false |

운영자 요청도 Origin·세션·role을 우회할 수 없다. 외부전송 transport 기본 거부. 실제 Toss test 계약은 lib/integrations/toss.ts의 오프라인 주입 테스트이며 실제 PG 통합 완료를 의미하지 않는다.
