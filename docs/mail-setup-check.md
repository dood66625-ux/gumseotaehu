# 이메일 연결 사전 점검

`npm run mail:check`는 기본적으로 오프라인이며 설정 유무만 출력한다. 키 원문·이메일 전체 주소를 출력하지 않고 DB·메일 업체 API·DNS를 조회하지 않는다. 설정된 키의 유효성, 발신 도메인 소유권, 실제 수신 성공이나 판매 준비 완료를 의미하지 않는다.

확인하는 환경변수: `TRANSACTION_MAIL_SENDER`, `TRANSACTION_MAIL_REPLY_TO`, `APP_ORIGIN`, `RESEND_API_KEY`, `RESEND_ACCOUNT_SCOPE`, `RESEND_WEBHOOK_SECRET`. `.env.local`은 기존 Git 제외 비공개 파일을 사용한다. 실제 메일 공급자·계정은 아직 연결하지 않았다. 문의용 Gmail 주소와 인증/거래 메일 발신 도메인은 별개다.

DNS 등록값은 업체 대시보드에서 발급받은 실제 값이어야 한다. 임의 SPF/DKIM 값을 만들거나 API 키를 DNS 값에 넣지 않는다. DNS 계획 파일은 아래 구조이며 `records`는 최대 12개다.

- `domain`: 발신용 도메인.
- `records`: `type`(TXT/MX/CNAME), `name`(전체 DNS 이름), `value`(업체의 정확한 공개 DNS 값). MX만 `priority` 필수.
- record name은 해당 도메인 내부여야 한다. MX/CNAME target은 업체 도메인일 수 있다.

```sh
# 명시적으로 요청한 경우에만 DNS 읽기 실행. DNS 변경이나 이메일 발송은 하지 않는다.
npm run mail:check -- --dns var/mail/provider-records.json
```

TXT 분할 조각 연결, 정확한 공개값 일치, MX 우선순위, CNAME 대소문자/마지막 점, 중복 SPF를 확인한다. 파일 32KiB, 질의 timeout 및 전체 5초 취소를 적용한다. 출력에는 일치 여부와 정해진 오류 코드만 포함하고 DNS TXT 원문이나 키를 표시하지 않는다. 불일치/조회 실패는 종료 코드 2, 잘못된 입력은 1이다. 오프라인 모드의 정상 실행은 설정 누락이 있어도 0이며, 출력의 구성 여부를 따로 확인해야 한다.

이 도구는 기대한 DNS 레코드가 보이는지 비교한다. SPF include 전체 평가, DMARC 조직 도메인 상속/정렬, DKIM 실제 서명, Resend 계정의 도메인 verified 상태, 도착률을 대신 검증하지 않는다. 업체에서 발급한 레코드 확인→DNS 반영→업체 소유권 확인→승인된 시험 수신함에서 실제 수신 검증이 남아 있다. 발송 worker와 실제 이메일 활성화는 별도 승인/구현이 필요하다.

2026-11-16: 타입 검사·관련 11개 테스트·오프라인 CLI 실행 통과. 가짜 DNS 응답으로 일치/불일치/중복 SPF/오류 비노출/잘못된 도메인·계획을 검증했다. 현재 실제 환경은 발신 도메인·계정·웹훅 키 미설정으로 확인됐으며 네트워크 조회·메일 발송은 하지 않았다. 웹앱 변경이 없어 전체 빌드·전체 E2E는 반복하지 않았다.
