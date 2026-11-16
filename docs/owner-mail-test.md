# 운영자 한 명 전용 시험 메일

실제 고객 발송 worker를 활성화하지 않는 독립 CLI다. 수신자는 운영자가 제공한 문의 주소 `mjreview3@gmail.com`, 발신자는 `archive@mail.gumseo.kr`, 제목은 `[금서태후] 이메일 연결 확인`으로 고정했다. 본문은 수신 확인을 요청하는 시험 문구와 랜덤 시험 식별자뿐이며 출생정보·운명서·PDF·결제 정보·인증번호를 넣지 않는다. 공개 사이트로 연결되는 링크·추적 픽셀·첨부파일도 없다.

```sh
npm run mail:owner -- --prepare
npm run mail:owner -- --status
# 운영자가 해당 수신 주소와 내용을 명시적으로 승인한 뒤에만 개발 담당자가 실행
npm run mail:owner -- --send --approve <prepared-approvalHash>
```

기본 준비/상태 명령은 공급자 요청을 하지 않는다. 발송 명령은 준비한 메시지의 SHA-256 해시가 일치해야 한다. 해시를 자동 생성하는 행위만으로 운영자의 발송 승인을 대신하지 않는다. 실제 메일 발송에는 대화에서 별도 승인해야 하며 현재 승인 전이다.

`var/owner-mail-test/attempt.sqlite`는 앱 고객 DB와 분리한다. envelope는 기존 DATA_KEY로 암호화하고 폴더 0700/DB 0600으로 보관한다. API 키를 DB에 넣지 않는다. 동일한 draft를 재사용하고 24시간이 지난 초안은 발송하지 않는다. 키와 상태 파일을 따로 보관하며 자동 초기화·삭제하지 않는다.

발송 전에 DB CAS로 dispatched를 남긴다. 접수 성공은 accepted로만 기록하며 delivered/고객 열람이라고 표시하지 않는다. 응답 누락·실패·중단은 자동 재발송하지 않으며, 운영자가 업체 대시보드와 받은편지함을 확인해야 한다. 이미 accepted인 시도는 재시작 후에도 다시 보내지 않는다. 다른 수신자/본문을 CLI 인자로 받지 않는다. 별도 scope `gumseo-mail`은 프로젝트용 계정 레이블이며 실제 Resend 조직 ID 검증을 의미하지 않는다.

2026-11-16: 타입 검사 및 owner 전용 ledger/Resend 어댑터 관련 22개 테스트 통과. 실제 발송 전 단계이며 테스트의 공급자 요청은 가짜 fetch만 사용했다. 기본 APP_MODE=local/EXTERNAL_EFFECTS=disabled와 다른 키는 보존했다. 웹훅 등록·실고객 발송·공개 운영은 활성화하지 않았다.
