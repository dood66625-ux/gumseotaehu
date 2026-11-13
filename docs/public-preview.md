# 외부 미리보기 준비 상태

사용자가 임시 외부 테스트 링크 생성에 명시적으로 동의했다. 개발 환경에서 Cloudflare Tunnel 연결은 거절되어, 실제 서버를 외부에 노출하지 않는 **합성 정보 전용 정적 미리보기**를 별도 제작했다.

- 기존 화면 컴포넌트 재사용, 고정된 가상 출생정보·이메일·문의 내용만 사용. 개인정보 입력 필드는 읽기 전용.
- 모의 OTP/결제/열람/재열람/문의는 브라우저 내부 어댑터와 합성 상태로 동작하며 `/api` 네트워크 요청0.
- 동일 가상 보고서의 실제 한글 PDF 저장 지원. 운영 DB/관리자/PG/AI/메일은 연결하지 않는다.
- 실제 운영 Next.js 서버를 배포하거나 실고객 정보를 전송한 것이 아니다. 랜딩 성능 보고서는 원래 Next.js 서비스의 측정값이며 별도 정적 체험 번들의 성능값으로 주장하지 않는다.

## 검증
`npm run build:preview`, `npm run typecheck` 및 `scripts/test-public-preview.mjs` 실행. 잠긴 입력→무료→가상 OTP→모의 결제→보고서/PDF→재열람→가상 문의, 관리자 제한을 확인했다. `docs/public-preview-test.json` 참조.

## 게시 차단 및 사용자 작업
산출물은 `gh-pages` 브랜치에 업로드했으나, 연결된 GitHub App의 Pages 쓰기 권한이 없어 Pages 활성화 요청이 **403 Resource not accessible by integration**으로 거절되었다. 사이트가 게시된 것으로 주장하지 않는다.

계정 소유자가 https://github.com/dood66625-ux/gumseotaehu/settings/pages 에서:
1. Source: **Deploy from a branch**
2. Branch: **gh-pages**, Folder: **/(root)**
3. **Save**

저장 이후 GitHub Pages 빌드를 완료하고 실제 외부 URL 접속/브라우저 흐름을 다시 확인해야 한다. 링크가 확인되기 전까지 상태는 활성화 대기다. 공개 미리보기에는 보안이 필요한 실제 데이터가 없으므로 암호 보호를 가장하지 않는다. 실제 개인정보를 입력하는 운영 서버는 계속 비공개이며 별도 승인·검증이 필요하다.
