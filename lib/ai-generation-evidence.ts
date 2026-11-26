/** Encrypted failed-response evidence; never exposed by public/admin order views. */
import { one, run, tx } from "./db";
import { seal } from "./security";
export function saveAiGenerationEvidence(
  orderId: string,
  version: number,
  raw: Record<string, any>,
) {
  tx(() => {
    const order = one(
      "SELECT version,payment_status,content_deleted,expires FROM orders WHERE id=?",
      orderId,
    );
    if (
      !order ||
      order.version !== version ||
      order.payment_status !== "paid" ||
      order.content_deleted ||
      order.expires <= Date.now()
    )
      throw Error("AI_EVIDENCE_ORDER_UNAVAILABLE");
    run(
      "INSERT INTO ai_generation_evidence(order_id,version,response_enc,created) VALUES(?,?,?,?) ON CONFLICT(order_id,version) DO NOTHING",
      orderId,
      order.version,
      seal(raw),
      Date.now(),
    );
  });
}
