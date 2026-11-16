# 비공개 합성 테스트 서버 준비

실제 고객 판매용 공개 배포가 아니다. 현재는 외부 서버/유료 계정을 만들지 않았고 DNS도 변경하지 않았다. 운영자는 Gmail 시험 메일 수신을 확인했으나 지연 원인은 미확정이다. 고객 메일/AI/PG worker는 비활성 상태로 유지한다.

## 구성

`deploy/Caddyfile.private`는 검증된 공식 Caddy 2.11.9를 사용한다. 전체 사이트에 Basic 인증을 적용하고 내부 CA의 로컬 TLS를 제공한다. 루프백에만 바인딩하며 Caddy 관리 API·설정 자동 저장·HTTP 자동 리다이렉트·OS 신뢰 저장소 자동 설치를 끈다. 접근 암호는 bcrypt 해시만 설정한다. 관리자 비밀번호나 API 키를 접근 암호로 재사용하지 않는다.

비인증 요청은 랜딩뿐 아니라 관리자·API·정적 파일도 401로 차단한다. 오류 응답에도 no-store/noindex를 적용한다. 게이트웨이 Authorization/Proxy-Authorization과 외부 Forwarded 헤더는 앱으로 넘기지 않는다. 앱 고객 세션·관리자 MFA·CSRF 검증은 그대로 유지한다. Basic 인증은 관리자 MFA나 고객 본인 인증의 대체가 아니다. 여러 사용자별 권한/접근 회수·강한 네트워크/WAF 제한은 실제 호스팅 검토에서 보강해야 한다.

이 패키지는 loopback 전용이다. 외부 접속 테스트에는 승인된 서버와 SSH 터널/VPN 등 제한된 접근 경로가 필요하다. 시스템 CA 설치·외부 공개 포트·공개 인증서 발급을 자동으로 하지 않는다. 사용자는 신뢰할 수 있는 경로로 CA 인증서를 확인해야 하며, 테스트 도구의 ignoreHTTPSErrors는 로컬 QA에만 사용한다. 공개 운영의 TLS 정책으로 쓰지 않는다.

## 실제 로컬 검증

`npm run test:staging`은 실제 Caddy, 실제 Next standalone 서버와 모의 worker를 시작한다. 테스트용 임의 자격증명/별도 DB만 전달하며 OpenAI/Resend/Toss 키를 전달하지 않는다. 포트는 127.0.0.1:3340과 localhost:3443만 사용한다. 공급자 요청은 없다. 종료 시 자식 프로세스와 이 실행의 임시 DB/CA를 정리한다.

검증: 비인증·잘못된 암호 차단, API/정적 경로 보호, no-store, CSRF 거부, 가상 이메일 인증→22,000원 모의 구매→worker 보고서→PDF, 로그아웃 뒤 보고서 거부, 같은 가상 이메일 재인증 후 원문 일치, 모바일 Chromium 랜딩/입력 이동. [기계 판독 결과](private-staging-test.json).

Caddy 다운로드는 공식 caddyserver/caddy 릴리스의 체크섬을 대조한다. v2.11.9의 공식 checksums 파일은 SHA-512 형식이다. 현재 로컬 archive는 이 체크섬과 일치했다. 바이너리·CA·암호는 Git에 넣지 않는다.

```sh
# 공식 바이너리를 준비/검증한 개발 환경에서 실행
CADDY_EXECUTABLE=/absolute/path/caddy npm run test:staging
```

이번에는 관련 통합 실행 1개와 타입 검사, 패키징 관련 단위 테스트만 수행한다. 전체 400여 개 테스트나 전체 E2E를 반복하지 않는다. 현재 테스트 결과는 외부 서버나 실제 iPhone에서의 검증이 아니다.

## 서버에 적용할 준비물

현재 소스는 단일 Linux 호스트의 Docker/지속 SQLite/worker 구성이다. RAM 2GB 이상, 지속 디스크, Docker Compose, SSH 접근과 백업 공간이 있는 서버를 우선 검토한다. 계정·요금·한국 접속·데이터 보관 위치는 구매 전에 확정해야 한다. 무상태 무료 호스팅에 현재 SQLite DB를 그대로 올리면 안 된다. 아직 서버 업체를 정하거나 비용을 승인받지 않았다.

설치 담당자가 기존 runtime 이미지를 준비한 뒤 `compose.local.yml`에 `deploy/compose.private.yml`을 겹쳐 APP_ORIGIN을 로컬 HTTPS 주소에 맞춘다. 원래 앱 origin이나 공개 도메인 gumseo.kr 설정을 자동 변경하지 않는다. 합성 테스트 서버는 새 암호화/관리자 키와 새 빈 데이터 볼륨을 사용하고, 개발 환경의 `.env.local`·공급자 키·DB를 통째로 복사하지 않는다.

```sh
docker compose --env-file <private-synthetic-env> -f compose.local.yml -f deploy/compose.private.yml config --quiet
# 실제 설치/배포 승인 이후에 담당자가 실행할 구성 예시
# docker compose ... up -d --no-build
```

`deploy/gumseo-private-gateway.service.example`는 Linux 설치 템플릿이며 설치/활성화하지 않았다. `/etc/gumseo/private-gateway.conf`에 STAGING_USER와 STAGING_PASSWORD_HASH를 비공개 설정한다. 실제 암호는 대화·명령행 인자·Git에 넣지 않고 Caddy의 대화형 hash-password 또는 담당자의 안전한 비밀 주입을 사용한다. 게이트웨이용 서비스 계정·경로와 파일 권한·실제 머신의 systemd/firewall 검증이 필요하다. 네이티브 게이트웨이의 localhost:3443은 내부 CA/SSH 접근을 위한 계획이며 아직 고객이 접속할 외부 URL이 아니다.

이미지 소스 clean build 네트워크 제한, 운영 DNS/TLS, 오프사이트 백업/경보, 실제 결제·AI·메일의 통합 검증 및 운영 공개 승인은 기존 차단 목록을 따른다.
