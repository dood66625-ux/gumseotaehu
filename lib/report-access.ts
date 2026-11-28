import { one, run } from "./db";
import { id } from "./security";
const retention = 30 * 86400000;
export function recordReportAccess(
  orderId: string,
  kind: "viewed" | "web_error" | "pdf_error" | "client_error" | "blocked",
  code: string | null = null,
  requestId: string = id(),
) {
  run(
    "INSERT OR IGNORE INTO report_access_events VALUES(?,?,?,?,?)",
    requestId,
    orderId,
    kind,
    code,
    Date.now(),
  );
}
/** Administration only. A response/PDF prefetch is not proof of a displayed report. */
export function orderAccessSummary(o: Record<string, any>, now = Date.now()) {
  const history = one(
    "SELECT SUM(CASE WHEN kind='viewed' THEN 1 ELSE 0 END) AS views,MIN(CASE WHEN kind='viewed' THEN created END) AS first_view,MAX(CASE WHEN kind='viewed' THEN created END) AS last_view,SUM(CASE WHEN kind IN ('web_error','pdf_error','client_error') THEN 1 ELSE 0 END) AS errors,SUM(CASE WHEN kind='blocked' THEN 1 ELSE 0 END) AS blocked FROM report_access_events WHERE order_id=? AND created>=?",
    o.id,
    now - retention,
  )!;
  const issue = one(
    "SELECT kind,code,created FROM report_access_events WHERE order_id=? AND kind<>'viewed' AND created>=? ORDER BY created DESC,id DESC LIMIT 1",
    o.id,
    now - retention,
  );
  const job = one(
    "SELECT state,error,attempts FROM jobs WHERE order_id=? AND version=?",
    o.id,
    o.version,
  );
  const legacy = one(
    "SELECT created FROM events WHERE event='report_open' AND target=?",
    o.id,
  );
  const exists = !!one(
    "SELECT 1 FROM reports WHERE order_id=? AND version=?",
    o.id,
    o.version,
  );
  let availability = "주문 상태 확인 필요";
  if (o.payment_status === "refunded") availability = "환불 완료 · 열람 종료";
  else if (o.content_deleted) availability = "원문 삭제 · 열람 불가";
  else if (o.payment_status === "refund_pending")
    availability = "취소 확인 중 · 열람 중단";
  else if (o.payment_status !== "paid")
    availability = "결제 확인 전 · 열람 불가";
  else if (!o.expires || o.expires <= now) availability = "열람기한 종료";
  else if (o.fulfillment === "ready")
    availability = exists ? "열람 가능" : "원문 확인 오류 · 열람 불가";
  else if (o.fulfillment === "failed") availability = "작성 실패 · 열람 불가";
  else if (o.fulfillment === "retrying")
    availability = "작성 재확인 중 · 아직 열람 불가";
  else availability = "작성 중 · 아직 열람 불가";
  return {
    viewCount: Number(history.views ?? 0),
    firstViewedAt: history.first_view ?? null,
    lastViewedAt: history.last_view ?? null,
    errorCount: Number(history.errors ?? 0),
    blockedCount: Number(history.blocked ?? 0),
    lastIssue: issue ?? null,
    legacyResponseAt: legacy?.created ?? null,
    availability,
    generationIssue:
      job && ["retrying", "failed"].includes(job.state)
        ? {
            code: /^[A-Z0-9_]{1,120}$/.test(job.error ?? "")
              ? job.error
              : "GENERATION_UNAVAILABLE",
            attempts: job.attempts,
          }
        : null,
    windowDays: 30,
  };
}
