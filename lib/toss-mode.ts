import { one } from "./db";
import { Fault } from "./security";
export function requireMockPayment(orderId?: string) {
  if (
    process.env.TOSS_PAYMENT_MODE &&
    process.env.TOSS_PAYMENT_MODE !== "disabled"
  )
    throw new Fault("MOCK_PAYMENT_DISABLED", 409);
  if (
    orderId &&
    one(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='toss_live_orders'",
    ) &&
    one("SELECT 1 FROM toss_live_orders WHERE order_id=?", orderId)
  )
    throw new Fault("LIVE_ORDER_REQUIRES_LIVE_VERIFICATION", 409);
}
