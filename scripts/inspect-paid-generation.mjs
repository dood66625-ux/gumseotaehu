/** Read-only running-container diagnostics. No customer inputs, credentials, response bodies or provider calls. */
import { DatabaseSync } from "node:sqlite";
let database;
try {
  database = new DatabaseSync(process.env.DATABASE_PATH, { readOnly: true });
  const has = (t) =>
    !!database
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(t);
  console.log(
    "작업 모드: " +
      (process.env.AI_WORKER_MODE === "openai" ? "AI 활성" : "AI 비활성") +
      " / 본문 설정: " +
      (process.env.AI_REPORT_PROFILE === "rich-ko-v1"
        ? "풍성한 한국어"
        : "표준"),
  );
  const rows = database
    .prepare(
      "SELECT o.id,o.version,o.fulfillment,j.state,j.attempts,j.error,j.lease_until,j.scheduled FROM orders o LEFT JOIN jobs j ON j.order_id=o.id AND j.version=o.version WHERE o.payment_status='paid' AND o.fulfillment!='ready' AND o.content_deleted=0 ORDER BY o.created DESC LIMIT 5",
    )
    .all();
  if (!rows.length) console.log("대기 중인 결제 완료 주문 없음");
  for (const row of rows) {
    const call = has("ai_spend_calls")
      ? database
          .prepare(
            "SELECT state,actual FROM ai_spend_calls WHERE order_id=? AND version=?",
          )
          .get(row.id, row.version)
      : null;
    console.log(
      "주문 " +
        row.id +
        " / 운명서 " +
        row.fulfillment +
        " / 작업 " +
        row.state +
        " / 시도 " +
        row.attempts,
    );
    console.log(
      "오류 코드: " +
        (/^[A-Z0-9_]{2,100}$/.test(String(row.error))
          ? row.error
          : "상세 코드 없음"),
    );
    console.log(
      "AI 예약: " +
        (call ? call.state : "없음") +
        " / 사용량 수신: " +
        (call?.actual != null ? "있음" : "없음") +
        " / 추가 API 호출 없음",
    );
    if (call && row.state !== "done")
      console.log(
        "자동 재호출 보류 상태입니다. 예약을 지우거나 다시 결제하지 마세요.",
      );
  }
} catch {
  console.error("GENERATION_INSPECTION_FAILED; 비밀값 출력 없음");
  process.exitCode = 1;
} finally {
  database?.close();
}
