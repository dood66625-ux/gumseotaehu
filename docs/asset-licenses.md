# 자산/주요 의존성
- empress.svg: 이 프로젝트에서 직접 작성한 창작 벡터. WebP는 sharp로 변환. 텍스트는 DOM, 캐릭터 원본 시안은 미첨부. 최종 상업 시안과 상표 권리는 운영자 확인 필요.
- NotoSansKR.ttf: Google Fonts 공식 github.com/google/fonts/ofl/notosanskr에서 취득. SIL Open Font License, assets/OFL.txt 보관. 웹 첫 화면에는 해당 10MB 폰트를 전송하지 않고 PDF에 부분 내장한다.
- 웹 글꼴: 사용자 기기의 시스템 글꼴, 외부 Google Fonts 요청 없음.
- Next/React/TypeScript/lunar-javascript/PDFKit/Zod: 주요 라이브러리 MIT(실제 lockfile 버전 고정). Lighthouse Apache-2.0, Playwright Apache-2.0, Vitest MIT, Prettier MIT.
- npm audit 전체/운영 의존성 결과는 docs/dependency-audit.json 참조. 스캔 당시 취약점이 없다는 결과는 향후 취약점이나 모든 보안 결함 부재를 보장하지 않는다.

## Royal v2 신규 자산 (2026-11-14)
- 태후 초상: OpenAI image generation 도구로 새로 만든 가상 인물. 특정 실제 인물·역사적 초상의 복제가 아니다. 워크스페이스 원본 PNG를 보존하고 모바일/데스크톱 WebP,PDF용JPEG를 제작했다. 공개 화면의 alt/하단에 AI 창작 이미지임을 표시한다. 공개자산은 public/empress-royal-v2.webp,empress-mobile-v2.webp,empress-avatar-v2.webp 및 assets/empress-pdf-v2.jpg. 실제 운영 이미지 표시·브랜드 권리 최종 검토는 기존 출시 절차를 따른다.
- Noto Serif KR: Google Fonts 공식 ofl/notoserifkr 소스,400굵기·화면용 글리프 부분집합 WOFF2. assets/NotoSerifKR-OFL.txt 보관.
- PDF 본문: Noto Sans KR의 변수 기본100굵기 대신400굵기로 인스턴스화한 assets/NotoSansKR-Book.ttf를 내장한다. 동일 OFL 적용. 웹 본문에6MB폰트를 보내지 않는다.
