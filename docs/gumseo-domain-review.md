# gumseo.kr 심사용 테스트 사이트

목표 주소: `https://gumseo.kr` → `https://pay.gumseo.kr`. 운영자가 이 도메인을 심사 기준으로 요청했다. **실제 판매·실결제·실제 AI·실고객 이메일을 활성화하지 않는다.**

## 구성

- gumseo.kr: 이미지/무료 합성 체험/상품 설명/환불·취소 규정/사업장 주소. 빌드 시 `/app/public/merchant-review`에 정적 파일만 생성한다. 키는 포함하지 않는다.
- pay.gumseo.kr: loopback 3212의 전용 Node 서버를 Caddy HTTPS로 연결한다. TEST 결제위젯 키만 허용하고 MID `tq_gdood65qf7`를 검증한다. 토스 SDK 결제창 → 서버 승인/조회 → 가상 보고서/PDF 흐름이다.
- 방문자별 HttpOnly 세션과 별도 가상 이메일·주문을 사용한다. 실제 고객 입력을 받지 않고 메일/AI 요청을 하지 않는다. 세션과 보고서는 별도 `/var/lib/gumseo-merchant-review`에 저장하며 기존 로컬 DB를 교체하지 않는다.
- 일반 관리자/취소 엔드포인트는 공개하지 않는다. 환불 심사 안내는 gumseo.kr/refund.html로 연결한다. 실운영 관리자 연동과 고객 인증/보관 정책은 별도 미완료다.
- 설치 시에만 root 소유 심사용 Compose를 등록한다. 등록 전 자동 배포로 공개되지 않는다. 설치 후에는 기존 자동화가 이미지 업데이트 시 해당 서비스도 갱신한다.

## 1. 가비아 DNS

기존 메일 DNS는 보존한다. A 레코드 두 개만 추가/수정한다.

| 타입 | 호스트 | 값 | TTL |
|---|---|---|---|
| A | @ | 115.68.223.204 | 600 |
| A | pay | 115.68.223.204 | 600 |

조회 당시 root에는 IPv4 A 응답이 없었고 pay는 NXDOMAIN이었다. 이미 A/CNAME/AAAA가 추가돼 있다면 새로 덮어쓰기 전에 현재 값을 확인한다. NS/MX/SPF/DKIM/DMARC는 변경하지 않는다.

## 2. 이미지 빌드 성공 후 최초 서버 설치

서버 SSH 창:

```bash
cd /opt/gumseo/source &&
git pull --ff-only &&
sudo systemctl start gumseo-private-update.service &&
sudo bash deploy/iwinv/install-merchant-review.sh
```

설정은 이미 존재하는 비공개 `/etc/gumseo/toss-sandbox.env`를 사용하므로 키를 다시 대화에 보내지 않는다. 설치기는 이미지 내부의 새 서버/정적 파일을 먼저 확인하고, 서비스/인증서를 위한 별도 볼륨을 만든 뒤 UFW 80/443을 연다. Node는 127.0.0.1:3212만 수신한다. Caddy가 인증서를 발급하며 비밀번호·키·요청 URL을 임의로 출력하지 않는다. DNS가 전파되지 않았으면 HTTPS 완료가 아니다.

## 3. 공개 확인 후 토스에 회신

두 HTTPS 주소의 인증서 오류 없는 접속, Footer 주소, 환불 상세 링크, 홈페이지의 구매 버튼과 테스트 결제수단·카드창, 방문자 주문 승인/PDF를 실제 공개 경로에서 확인한다. 이 검증 전 완료 회신하지 않는다. 테스트 환경으로 심사가 가능한지 또는 운영 연결이 필요한지는 토스의 심사 기준에 따른다. 운영 결제 요구 시 별도 명시적 승인과 출시 차단 해소가 필요하다.

## 검증한 범위

관련 TS 테스트 50개, 자동화 테스트 14개, native Node/SQLite/HTTP 통합 시험(방문자 분리·모의 토스 승인·보고서/PDF·재시작 유지·CSRF·관리자 차단), 390px 모바일 구매 버튼의 pay 도메인 연결 시험, Caddy/Compose 설정 및 앱 빌드를 확인했다. 실제 외부 카드 결제 요청은 이 개발 검증에서 수행하지 않았다. DNS/공개 TLS/새 도메인의 실제 토스 인증은 아직 미확인이다. 이 문서와 상태 파일은 심사 통과를 주장하지 않는다.
