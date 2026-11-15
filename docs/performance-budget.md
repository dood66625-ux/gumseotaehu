# 모바일 첫 방문 성능 · Royal v2

2026-11-14, 실사풍 AI 창작 초상/명조 웹폰트를 반영한 독립 Next.js production standalone 랜딩. Chromium 158,390×844 DPR3,4G RTT150ms/1.6Mbps,CPU4배 감속,로컬 loopback 측정. 실제 한국 통신망·실사용자 p75가 아니다.

|모바일 Lighthouse|LCP|CLS|TBT|성능|전체 전송|
|---|---|---|---|---|---|
|1|1.969초|0.000324|47.6ms|99|186,791 B|
|2|1.972초|0.000324|7.0ms|99|186,791 B|
|3|1.966초|0.000324|0.0ms|99|186,791 B|

LCP≤2.5초와 CLS≤0.1 목표를3회 모두 충족했다. 접근성/Best Practices는3회100점. 별도5회 CDP 조작 시험의 표본75분위는 LCP 0.872초,CLS 0.000324,제한된 FAQ 조작의 Event Timing 최대값 표본75분위 40ms. **실사용자 INP 인증이 아니며 TBT를 INP로 대체하지 않는다.**

## 초기 전송/자산

- 첫 화면 모바일 WebP 약64KB,데스크톱 WebP187KB,별도 아바타6KB. picture/media로 모바일에 큰 이미지를 함께 받지 않도록 분리.
- 명조폰트는 합법적인 Noto Serif KR400의 WOFF2부분집합 약103KB. font-display:swap,폰트 로딩과 별개로 이미지/CTA 표시. 본문은 시스템 글꼴.
- 랜딩은 build-time HTML route이며 브라우저 React 런타임을 요청하지 않는다. 선택적인5초 스토리·작은줌은 즉시 건너뛸 수 있고 reduced-motion 대응. 사전 제작 영상의 다운로드를 기다리지 않는다.
- 초상에는 처음부터 크기와 고우선순위/모바일 소스를 지정한다. 영상·PG·AI·DB·메일·외부폰트 요청이 랜딩을 막지 않는다.
- 가상정보 공개 미리보기도 홈페이지에서는 React 번들을 요청하지 않는다. 입력/결제 체험을 선택했을 때만 별도 번들을 불러온다.

## 비교와 예산

초기기본 App Router hydration: LCP2.57~2.66초,약195KB. 정적 벡터 버전:0.91~1.01초,약14KB. 최종 Royal v2는 실사풍 초상과 글꼴을 사용해약187KB이며 LCP약1.97초로 목표를 유지한다. 이전 값은 performance-pre-royal-v2.json/lighthouse-pre-royal-v2.json,현재 원본은 performance-results.json/lighthouse-1~3.json. 서로 다른 아트 자산이므로14KB를 현재 예산으로 주장하지 않는다.

현재 예산: 모바일 첫 화면 gzip전체≤220KB,poster≤80KB,초기스크립트≤2KB,원격폰트·영상0. 실제 영상추가시LCP이후선택요청/저속연결미요청을 검증한다. 이미지/글꼴 변경 뒤 재측정.

실기기 iOS/Android/인스타·카카오 브라우저,지역TTFB/CDN·동시부하·운영RUM p75(LCP2.5초,INP200ms,CLS0.1)는 별도 검증해야 한다. 로컬100/99점만으로 출시 승인을 대신하지 않는다.

재현: npm run build → npm run start → npm run test:performance. 측정 중 다른 브라우저/빌드 부하를 분리한다.

## AI 연동 보강 후 회귀 확인

2026-11-15 기준 같은 로컬 측정 조건의 분리 재검증: 모바일 Lighthouse 3회 LCP 1.961/1.965/1.963초, CLS 0.000324, TBT 15.5/0/0ms, 성능 99/99/99, 접근성·Best Practices 100. 전체 전송 186,901 B. CDP 5회 표본 75분위 LCP 0.876초, 제한된 FAQ 조작 Event Timing 40ms이며 실사용자 INP가 아니다.

앞선 회귀 측정에서는 3번째 결과의 TBT 1,590ms/성능 73점이 나타났다. 대부분이 `Unattributable`/`Other`였으며 소스 원인을 특정하지 못했다. 이 결과를 `performance-ai-first-run.json`과 `lighthouse-ai-first-outlier.json`에 남겼다. 다른 작업 없이 한 차례 다시 측정했을 때 재현되지 않았다는 의미이며, 원인이 해결됐거나 실제 운영 지연이 없다는 보장은 아니다. 사용자 요청에 따라 추가 속도 튜닝보다 구매·운명서 제공 기능을 우선한다.
