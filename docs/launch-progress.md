# 출시 진행표 · 대단원 / 중단원 / 소단원

기준일: 2026-11-28 KST. **78.6% · 44/56 소단원 완료 · 12개 남음.**

정의된 소단원 완료 조건 수: 완료 100%, 미완료·진행 중 0%. 중단원·대단원·총 진행률은 하위 소단원 완료/전체 ×100(소수 첫째 자리). 테스트 개수·시간·개발비 비중이 아니며 출시 승인과 별개. 범위 변경 시 개수를 재산정한다. 2026-11-19 v2: 운영 백엔드와 구분해 운영 카드창/복귀 화면 개발 조건 1개를 추가했다(55→56개). 2026-11-27 v3: 현 도메인 카드 승인/열람은 사용자가 승인한 실제 거래 확인으로 TEST 방식을 대체한다. 기존 운영 활성화 승인을 완료에 반영하고 환불/메일/최종 인수는 별도로 유지한다(전체56개 유지).

약 73%는 2026-11-17 당시 추정치이며 아래 체크리스트 비율과 직접 비교하지 않는다.

남은 작업량: 개발 1개 / 현장·전문 검증·심사 11개 / 운영 결정·승인 0개. 단위별 크기가 달라 같은 기간을 뜻하지 않으며 심사 대기 시간은 예측하지 않습니다.

| 대단원 | 진행률 | 완료/전체 | 남음 |
|---|---:|---:|---:|
| 1. 고객 화면·운명서 | 88.9% | 8/9 | 1 |
| 2. 사주 계산·AI | 77.8% | 7/9 | 2 |
| 3. 결제·환불 | 90.9% | 10/11 | 1 |
| 4. 이메일 | 77.8% | 7/9 | 2 |
| 5. 배포·보안·복구 | 83.3% | 10/12 | 2 |
| 6. 사업·최종 출시 | 33.3% | 2/6 | 4 |

## 1. 고객 화면·운명서

### 1.1 디자인·콘텐츠 · 100% · 5/5 완료

- [x] **1.1.1** 홈페이지·입력·보고서 디자인 구현 · 100% — 근거: [report-reading-guide.md](report-reading-guide.md)
- [x] **1.1.2** 중국 궁정풍 공통 그림·오행·장별 그림 적용 · 100% — 근거: [report-reading-guide.md](report-reading-guide.md)
- [x] **1.1.3** 태후 말투·쉬운 풀이·용어 설명 구현 · 100% — 근거: [report-reading-guide.md](report-reading-guide.md)
- [x] **1.1.4** 웹/PDF 정보 배치·필수 안내 접근 경로 구현 · 100% — 근거: [report-reading-guide.md](report-reading-guide.md)
- [x] **1.1.5** 출시 상품 전체 내용·가독성 최종 검수 · 100% — 근거: [customer-reading-review.md](customer-reading-review.md)

### 1.2 이용·재열람 · 75% · 3/4 완료

- [x] **1.2.1** 입력 확인·무료 미리보기·모의 구매 흐름 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **1.2.2** 저장본/PDF·이메일 정정·접근 종료 복구 구현 · 100% — 근거: [customer-recovery-checks.md](customer-recovery-checks.md)
- [x] **1.2.3** 비공개 한국어 AI 페이지·저장본 목록 구현 · 100% — 근거: [private-reader.md](private-reader.md)
- [ ] **1.2.4** 실 iOS/Android·인앱·결제 앱 복귀·PDF 저장 점검 · 0% — 남음: 현장·전문 검증/심사

## 2. 사주 계산·AI

### 2.1 계산·해석 품질 · 50% · 2/4 완료

- [x] **2.1.1** 한국 출생 계산·절기 경계·시간 미상 보호 구현 · 100% — 근거: [astrology-boundary-validation.md](astrology-boundary-validation.md)
- [x] **2.1.2** 과거 대만 UTC+8 검증 기록 보관(현재 기능 비노출) · 100% — 근거: [private-reader.md](private-reader.md)
- [ ] **2.1.3** 음력·절기·대운 계산 독립 전문가 검수 · 0% — 남음: 현장·전문 검증/심사
- [ ] **2.1.4** 최종 한국어 AI 내용·어조·사실성 검수 · 0% — 남음: 현장·전문 검증/심사

### 2.2 AI 생성 운영 · 100% · 5/5 완료

- [x] **2.2.1** 실제 AI 생성·저장·재열람·PDF 검증 · 100% — 근거: [openai-funded-test-results.json](openai-funded-test-results.json)
- [x] **2.2.2** 고정 모델/요청·전송 승인·사용량 기록 구현 · 100% — 근거: [ai-spend-controls.md](ai-spend-controls.md)
- [x] **2.2.3** 주문 중복·비용 예약·일별/누적 한도 구현 · 100% — 근거: [ai-spend-controls.md](ai-spend-controls.md)
- [x] **2.2.4** 체험/AI 큐 분리·재시작·종료 보호 구현 · 100% — 근거: [ai-spend-controls.md](ai-spend-controls.md)
- [x] **2.2.5** 본 서비스 AI worker 등록·복원 보류/전환 연결 · 100% — 근거: [ai-worker-operations.md](ai-worker-operations.md)

## 3. 결제·환불

### 3.1 토스 결제 · 85.7% · 6/7 완료

- [x] **3.1.1** 서버 가격·주문 대조·중복 결제 방어 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **3.1.2** 격리 실제 TEST 승인·독립 조회 확인 · 100% — 근거: [toss-owner-test-results.json](toss-owner-test-results.json)
- [x] **3.1.3** 심사 도메인 HTTPS·TEST 카드창 진입 확인 · 100% — 근거: [toss-review-public-checks.json](toss-review-public-checks.json)
- [x] **3.1.4** 현 도메인 카드 승인·운명서 열람 확인(TEST 또는 승인된 실거래) · 100% — 근거: [launch-readiness-20261127.md](launch-readiness-20261127.md)
- [x] **3.1.5** 실운영 승인/조회·검증 웹훅 연결 · 100% — 근거: [toss-live-operations.md](toss-live-operations.md)
- [ ] **3.1.6** 퀵오픈 이용 상태·계약/정산 조건 확인(카드사 심사는 병행) · 0% — 남음: 현장·전문 검증/심사
- [x] **3.1.7** 운영 카드 결제창·결제 후 복귀 화면과 서버 검증 연결 · 100% — 근거: [toss-live-operations.md](toss-live-operations.md)

### 3.2 환불·구매 증빙 · 100% · 4/4 완료

- [x] **3.2.1** 격리 TEST 관리자 MFA 전액 취소·PDF 차단 확인 · 100% — 근거: [toss-owner-test-results.json](toss-owner-test-results.json)
- [x] **3.2.2** 환불 대기·실패 복구·주문 상태/기록 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **3.2.3** 실운영 취소/환불·구매 증빙 경로 연결 · 100% — 근거: [toss-live-operations.md](toss-live-operations.md)
- [x] **3.2.4** 실운영 승인·취소·고객 접근 종료 통합 검증 · 100% — 근거: [launch-readiness-20261127.md](launch-readiness-20261127.md)

## 4. 이메일

### 4.1 발송·확인 코드 · 100% · 5/5 완료

- [x] **4.1.1** 인증·구매·완성·재열람 메일 템플릿 구현 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)
- [x] **4.1.2** Resend HTTP·서명 웹훅 수신 구현 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)
- [x] **4.1.3** 응답 유실·영구 반송·재발송 차단 구현 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)
- [x] **4.1.4** 서명 전환 파일·전송기/큐 사이클 연결 검증 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)
- [x] **4.1.5** 관리자 집계·복원 보류·메일 상태 점검 구현 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)

### 4.2 운영 전환 검증 · 50% · 2/4 완료

- [x] **4.2.1** 발신 도메인 Verified·운영자 시험 메일 수신 확인 · 100% — 근거: [OWNER_ACTION_REQUIRED.md](../OWNER_ACTION_REQUIRED.md)
- [ ] **4.2.2** 운영 조회 권한·웹훅 계정 등록 확인 · 0% — 남음: 현장·전문 검증/심사
- [ ] **4.2.3** 통제된 실제 OTP/운명서 안내 수신·반송 검증 · 0% — 남음: 현장·전문 검증/심사
- [x] **4.2.4** 운영 mail worker 연결·로컬 OTP 노출 제거 · 100% — 근거: [mail-worker-integration.md](mail-worker-integration.md)

## 5. 배포·보안·복구

### 5.1 배포·장애 복구 · 75% · 3/4 완료

- [x] **5.1.1** 런타임 패키지·CI·자동 업데이트 구성 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **5.1.2** 서버/PC 백업·상태 감시 예약 확인 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **5.1.3** 비공개 초대·분리 저장소·실제 사용 보고 · 100% — 근거: [private-reader.md](private-reader.md)
- [ ] **5.1.4** 실제 호스트 복구 훈련·상시 외부 장애 알림 · 0% — 남음: 현장·전문 검증/심사

### 5.2 개인정보와 보존 · 100% · 5/5 완료

- [x] **5.2.1** 암호화·출력 마스킹·오프라인 키 회전 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **5.2.2** 접속 권한·본인 입력/동의·기본 남용 제한 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **5.2.3** 삭제·암호화 백업·로컬 체크포인트 구현 · 100% — 근거: [privacy-checkpoints.md](privacy-checkpoints.md)
- [x] **5.2.4** 거래기록 보존 기한·법적 보류·자동 파기 구현 · 100% — 근거: [retention-runtime.md](retention-runtime.md)
- [x] **5.2.5** 외부 삭제 이력 동기화·최신 원장 복원 보호 연결 · 100% — 근거: [retention-runtime.md](retention-runtime.md)

### 5.3 운영자·외부 접근 · 66.7% · 2/3 완료

- [x] **5.3.1** 역할 검사·최근 재인증·재사용 방지 구현 · 100% — 근거: [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [x] **5.3.2** 출시 운영자 비밀 등록·복구·회수 절차 구현 · 100% — 근거: [operator-identity.md](operator-identity.md)
- [ ] **5.3.3** 신뢰 프록시 IP·WAF·운영 rate limit 연결 · 0% — 남음: 개발

## 6. 사업·최종 출시

### 6.1 사업·정책 검토 · 25% · 1/4 완료

- [x] **6.1.1** 제공받은 사업자 정보·주소·정책 링크 표시 · 100% — 근거: [business.ts](../lib/business.ts)
- [ ] **6.1.2** 필수 연락처/등록·호스팅/사업자 고지·세무 검토 · 0% — 남음: 현장·전문 검증/심사
- [ ] **6.1.3** 약관·청약철회·개인정보/AI 전송 고지 법무 검토 · 0% — 남음: 현장·전문 검증/심사
- [ ] **6.1.4** 유료 구매 연령/본인확인·미성년 계약 PG 검토 · 0% — 남음: 현장·전문 검증/심사

### 6.2 출시 인수 · 50% · 1/2 완료

- [ ] **6.2.1** 운영 호스트 성능·구매부터 열람까지 최종 인수 · 0% — 남음: 현장·전문 검증/심사
- [x] **6.2.2** 판매 범위·모델/예산·실결제/실메일 활성화 승인 · 100% — 근거: [launch-readiness-20261127.md](launch-readiness-20261127.md)

## 별도 확장 범위

- 유료 광고/GA4/CAPI 운영
- 다중 호스트 DB 확장
- 지원하지 않는 과거/해외 시간대 확대
- 부분환불/복합결제 등 상품 확장(지원 여부 결정 후 추가)
- 대만·번체 신규 개발 및 운영 재개(현재 비노출, 기존 저장자료는 보관 정책 유지)

이 항목들은 현재 남은 소단원 수에 포함하지 않습니다. 실제 출시 범위로 결정하면 목록 버전과 수량을 갱신합니다.
