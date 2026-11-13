# 자산/주요 의존성
- empress.svg: 이 프로젝트에서 직접 작성한 창작 벡터. WebP는 sharp로 변환. 텍스트는 DOM, 캐릭터 원본 시안은 미첨부. 최종 상업 시안과 상표 권리는 운영자 확인 필요.
- NotoSansKR.ttf: Google Fonts 공식 github.com/google/fonts/ofl/notosanskr에서 취득. SIL Open Font License, assets/OFL.txt 보관. 웹 첫 화면에는 해당 10MB 폰트를 전송하지 않고 PDF에 부분 내장한다.
- 웹 글꼴: 사용자 기기의 시스템 글꼴, 외부 Google Fonts 요청 없음.
- Next/React/TypeScript/lunar-javascript/PDFKit/Zod: 주요 라이브러리 MIT(실제 lockfile 버전 고정). Lighthouse Apache-2.0, Playwright Apache-2.0, Vitest MIT, Prettier MIT.
- npm audit 전체/운영 의존성 결과는 docs/dependency-audit.json 참조. 스캔 당시 취약점이 없다는 결과는 향후 취약점이나 모든 보안 결함 부재를 보장하지 않는다.
