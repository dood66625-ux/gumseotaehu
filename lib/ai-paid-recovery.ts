/** Operator-selected recovery: preserve the original reservation and payment; at most one new version. */
import { db, one, run, tx } from "./db";
import { audit, id } from "./security";
import { holdSalesCapacity } from "./sales-capacity";
import type { AiSpendPolicy } from "./ai-spend-ledger";
export function queuePaidAiRecovery(
  orderId: string,
  policy: AiSpendPolicy,
  cutoff: number,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  )
    throw Error("AI_EXPLICIT_ORDER_REQUIRED");
  orderId = orderId.toLowerCase();
  return tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", orderId);
    if (
      !o ||
      o.payment_status !== "paid" ||
      o.content_deleted ||
      o.expires <= Date.now() ||
      o.created < cutoff ||
      o.fulfillment === "ready"
    )
      throw Error("AI_RECOVERY_ORDER_NOT_ELIGIBLE");
    if (
      one(
        "SELECT 1 FROM audit WHERE target=? AND action='ai_paid_recovery_queued'",
        orderId,
      )
    )
      return false;
    const j = one(
      "SELECT * FROM jobs WHERE order_id=? AND version=?",
      orderId,
      o.version,
    );
    const call = one(
      "SELECT * FROM ai_spend_calls WHERE order_id=? AND version=?",
      orderId,
      o.version,
    );
    if (
      o.version !== 1 ||
      !j ||
      !["retrying", "failed"].includes(j.state) ||
      !call ||
      call.state !== "uncertain" ||
      call.actual == null ||
      !one(
        "SELECT 1 FROM order_generation_lanes WHERE order_id=? AND provider='openai'",
        orderId,
      ) ||
      one("SELECT 1 FROM reports WHERE order_id=?", orderId)
    )
      throw Error("AI_RECOVERY_NOT_CONFIRMED_FAILED");
    if (one("SELECT 1 FROM ai_generation_evidence WHERE order_id=?", orderId))
      throw Error("AI_SAVED_RESPONSE_REVIEW_REQUIRED");
    const version = o.version + 1;
    holdSalesCapacity(db(), orderId, version, policy);
    run("UPDATE jobs SET state='canceled',lease_until=NULL WHERE id=?", j.id);
    run(
      "UPDATE orders SET version=?,fulfillment='queued' WHERE id=?",
      version,
      orderId,
    );
    run(
      "INSERT INTO reading_history(order_id,reading_id,version) VALUES(?,?,?)",
      orderId,
      o.reading_id,
      version,
    );
    run(
      "UPDATE order_generation_lanes SET assigned_version=? WHERE order_id=?",
      version,
      orderId,
    );
    run(
      "INSERT INTO jobs(id,order_id,version,state,scheduled) VALUES(?,?,?,'queued',?)",
      id(),
      orderId,
      version,
      Date.now(),
    );
    audit("operator-cli", "ai_paid_recovery_queued", orderId);
    return true;
  });
}
