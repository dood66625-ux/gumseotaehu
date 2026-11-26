/** Read-only deployment inspection. No provider requests, key output, enrollment, or database writes. */
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
/** @param {Record<string, string | undefined>} env */
export function inspectQuickOpen(env = process.env) {
  const file = (name) => {
    try {
      const path = env[name];
      return !!path && existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  };
  let database;
  let databaseReadable = false;
  const enrollment = { payments: false, ai: false };
  try {
    if (env.DATABASE_PATH && existsSync(env.DATABASE_PATH)) {
      database = new DatabaseSync(env.DATABASE_PATH, { readOnly: true });
      databaseReadable = true;
      for (const [name, table] of [
        ["payments", "toss_live_enrollment"],
        ["ai", "ai_worker_enrollment"],
      ]) {
        if (
          database
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table)
        ) {
          const row = database
            .prepare("SELECT recovery_hold FROM " + table + " WHERE id=1")
            .get();
          enrollment[name] = !!row && row.recovery_hold === 0;
        }
      }
    }
  } catch {
    databaseReadable = false;
  } finally {
    database?.close();
  }
  const checks = [
    ["https", "웹 주소 HTTPS", /^https:\/\/[^/]+$/.test(env.APP_ORIGIN ?? "")],
    ["database", "기존 DB 읽기", databaseReadable],
    ["payment-mode", "실제 결제 경로", env.TOSS_PAYMENT_MODE === "live"],
    [
      "payment-approval",
      "실결제 운영 설정",
      env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved",
    ],
    [
      "payment-secret",
      "토스 운영 서버 키 형식",
      /^live_gsk_[A-Za-z0-9_]{8,500}$/.test(env.TOSS_LIVE_SECRET_KEY ?? ""),
    ],
    [
      "payment-client",
      "토스 운영 클라이언트 키 형식",
      /^live_gck_[A-Za-z0-9_]{8,500}$/.test(env.TOSS_LIVE_CLIENT_KEY ?? ""),
    ],
    [
      "merchant",
      "운영 상점 ID 설정",
      /^[A-Za-z0-9_-]{1,100}$/.test(env.TOSS_LIVE_MERCHANT_ID ?? ""),
    ],
    ["payment-cutover", "결제 전환 파일 존재", file("TOSS_LIVE_CUTOVER_FILE")],
    [
      "payment-enrollment",
      "결제 등록·복원 보류 해제 상태",
      enrollment.payments,
    ],
    ["ai-mode", "구매 운명서 AI 작업 경로", env.AI_WORKER_MODE === "openai"],
    [
      "ai-approval",
      "고객 정보 AI 전송 설정",
      env.CUSTOMER_AI_APPROVAL === "customer-data-approved",
    ],
    ["ai-key", "기존 AI 키 설정 여부", !!env.OPENAI_API_KEY],
    [
      "ai-budget",
      "일·누적·건별 예산 설정",
      [
        "AI_DAILY_USD_MICROS",
        "AI_LIFETIME_USD_MICROS",
        "AI_RESERVATION_USD_MICROS",
      ].every(
        (k) =>
          /^[1-9][0-9]*$/.test(env[k] ?? "") &&
          Number.isSafeInteger(Number(env[k])),
      ),
    ],
    ["ai-cutover", "AI 전환 파일 존재", file("AI_CUTOVER_FILE")],
    ["ai-enrollment", "AI 등록·복원 보류 해제 상태", enrollment.ai],
    [
      "mail-mode",
      "실제 인증·재열람 메일 작업 경로",
      env.MAIL_WORKER_MODE === "resend",
    ],
    [
      "mail-approval",
      "고객 메일 발송 설정",
      env.CUSTOMER_MAIL_APPROVAL === "customer-mail-approved",
    ],
    ["mail-key", "기존 메일 키 설정 여부", !!env.RESEND_API_KEY],
    [
      "mail-profile",
      "발신·회신·메일 계정 설정",
      [
        "TRANSACTION_MAIL_SENDER",
        "TRANSACTION_MAIL_REPLY_TO",
        "RESEND_ACCOUNT_SCOPE",
      ].every((k) => !!env[k]),
    ],
    ["mail-cutover", "메일 전환 파일 존재", file("MAIL_CUTOVER_FILE")],
  ].map(([id, label, ok]) => ({ id, label, ok }));
  return {
    scope: "current-container-configuration-only",
    contractPath: "quick-open",
    cardReviewCompletionRequiredForThisCheck: false,
    configured: checks.filter((c) => c.ok).length,
    total: checks.length,
    checks,
    runtimeConfigurationComplete: checks.every((c) => c.ok),
    launchReady: false, // Configuration inspection alone never proves a working sales flow.
    providerCalls: 0,
    settingsChanged: false,
    stillRequires: [
      "실제 상점 퀵오픈 활성 상태 확인",
      "서명 전환 파일·DB·키 일치 검증",
      "공개 도메인의 실제 고객 경로 연결",
      "결제부터 AI 운명서·메일·재열람까지 통제된 최종 인수",
    ],
  };
}
if (!process.argv[1] || pathToFileURL(process.argv[1]).href === import.meta.url)
  console.log(JSON.stringify(inspectQuickOpen(), null, 2));
