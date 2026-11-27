/** Read-only operations view. Never creates a ledger or releases a reservation. */
import type { DatabaseSync } from "node:sqlite";
function available(db: DatabaseSync) {
  return !!db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_spend_calls'",
    )
    .get();
}
export function hasAiReservation(
  db: DatabaseSync,
  orderId: string,
  version: number,
) {
  return (
    available(db) &&
    !!db
      .prepare("SELECT 1 FROM ai_spend_calls WHERE order_id=? AND version=?")
      .get(orderId.toLowerCase(), version)
  );
}
export function aiSpendReview(db: DatabaseSync) {
  if (!available(db)) return { available: false, entries: [] };
  const hasCounsel = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='taehou_counsel'")
    .get();
  const entries = db
    .prepare(
      `SELECT c.order_id orderId,c.version,c.state,c.reserved reservedUsdMicros,c.actual estimatedUsdMicros,c.created,
    CASE WHEN r.id IS NULL THEN 0 ELSE 1 END hasReport FROM ai_spend_calls c
    JOIN orders o ON o.id=c.order_id LEFT JOIN reports r ON r.order_id=c.order_id AND r.version=c.version
    WHERE c.state!='completed' OR (r.id IS NULL ${hasCounsel ? "AND NOT EXISTS(SELECT 1 FROM taehou_counsel t WHERE t.reservation_id=c.id AND t.state='answered')" : ""}) ORDER BY c.created DESC LIMIT 50`,
    )
    .all();
  return { available: true, entries };
}
