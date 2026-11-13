# 모바일 첫 방문 성능

측정: 독립 Next.js production standalone, 로컬 loopback, Chromium 158, 390×844 DPR3, 4G RTT150ms/1.6Mbps, CPU4배 감속. 실인프라·한국 통신망·실 사용자 p75가 아니다. 원본 JSON: performance-results.json와 lighthouse-1~3.json. 이전: performance-before.json/lighthouse-before.json.

|Lighthouse 모바일 반복|LCP|CLS|TBT|성능 점수|전체 전송|
|---|---|---|---|---|---|
|1|0.968초|0.000107|11ms|100|13,716 B|
|2|0.914초|0.000107|0ms|100|13,716 B|
|3|1.012초|0.000107|32ms|100|13,716 B|

- LCP 목표≤2.5초: 로컬 Lighthouse3회 모두 충족.
- CLS 목표≤0.1: 모두 충족.
- 접근성/Best Practices: 모두100점. 자동 검사가 모든 접근성/보안 준수를 증명하지 않는다.
- 별도 Playwright/CDP5회 cold context, 동일 network/CPU: 표본75분위 LCP 0.580초, CLS 0, 제한된 FAQ 조작의 Event Timing 최대값 표본75분위 24ms. **운영 INP/p75 인증이 아니며 TBT를 INP로 대체하지 않는다.** 실제 사용자/충분한 조작과 재방문·앱내 브라우저는 별도 검증 필요.
- 최초 CTA가390×844뷰포트 안에 표시됨.320px가로 넘침/JS차단/이미지와 CTA 독립표시도 E2E 검증.

## 원인과 개선
기본 App Router hydration 랜딩에서 Lighthouse LCP2.57~2.66초/TBT356~560ms, 전체전송194,642B를 측정했다. 링크 prefetch 제거와 inline SVG만으로는 LCP2.40~2.69초로 충분하지 않았다. 최종적으로 **랜딩만 build-time HTML route**로 변경해 React browser runtime을 제거했다. 빌드 JSX/Shell은 공유하며 다른 기능은 정상 App Router다. 특정 측정도구·UA에 따른 분기가 없다.

첫 화면은 작은 정적 SVG를 HTML에 포함하고, CSS와 약0.4KB선택적 intro.js만 요청한다. 폰트/영상/AI/DB/결제/메일 요청은0.5초 표시를 기다리게 하지 않는다. 스토리는 로딩후5초 텍스트 연출, 기본 링크로 즉시 건너뛰기, reduced-motion시 연출 없음. 제공되지 않은 영상 다운로드는 발생하지 않는다. 원본 영상은 승인을 거쳐 poster이후/저속연결 제외 지연요청으로 추가 검증해야 한다.

## 예산/출시 게이트
현재 랜딩 전체 gzip전송≤30KB, 브라우저JS≤2KB, 외부폰트/영상0, HTML TTFB목표≤300ms(한국스테이징측정필요). 향후 실사 poster이미지≤100KB,5초영상≤700KB권장·LCP이후선택요청. 실사교체후재측정. 지역TTFB/CDN/캐시/HTTPS/트래픽·인스타/카카오/iOS 실기기 및 운영RUM p75(LCP2.5초,INP200ms,CLS0.1) 확인 전 전체 성능 출시 승인은 보류한다.

재현: npm run build → npm run start → npm run test:performance. 테스트도구와동시부하를분리한다.
