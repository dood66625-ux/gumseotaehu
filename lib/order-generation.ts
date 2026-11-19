/** Trusted internal preparation only. No route, environment opt-in, or bulk reassignment. */
import { one, run, tx } from "./db";
export type GenerationLane = "mock" | "openai";
export function prepareAiOrder(orderId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  )
    throw Error("AI_EXPLICIT_ORDER_REQUIRED");
  orderId = orderId.toLowerCase();
  return tx(() => {
    const order = one("SELECT * FROM orders WHERE id=?", orderId);
    if (
      !order ||
      order.payment_status !== "paid" ||
      order.content_deleted ||
      order.expires <= Date.now()
    )
      throw Error("AI_ORDER_NOT_ELIGIBLE");
    if (one("SELECT 1 FROM order_generation_lanes WHERE order_id=?", orderId))
      return false;
    const job = one(
      "SELECT state,attempts FROM jobs WHERE order_id=? AND version=?",
      orderId,
      order.version,
    );
    if (
      !job ||
      job.state !== "queued" ||
      job.attempts !== 0 ||
      one("SELECT 1 FROM reports WHERE order_id=?", orderId)
    )
      throw Error("AI_ORDER_ALREADY_STARTED");
    run(
      "INSERT INTO order_generation_lanes VALUES(?,'openai',?,?)",
      orderId,
      order.version,
      Date.now(),
    );
    return true;
  });
}
