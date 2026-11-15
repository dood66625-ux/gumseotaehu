import { PRODUCT_PRICE_KRW, isSupportedOrderAmount } from "../product";
import { z } from "zod";
import { blockedTransport, type Transport } from "./contracts";
const payment = z.object({
  paymentKey: z.string(),
  orderId: z.string(),
  mId: z.string().optional(),
  currency: z.string().optional(),
  type: z.string().optional(),
  balanceAmount: z.number().int().optional(),
  approvedAt: z.string().nullable().optional(),
  totalAmount: z.number().int(),
  status: z.enum([
    "DONE",
    "CANCELED",
    "PARTIAL_CANCELED",
    "WAITING_FOR_DEPOSIT",
    "ABORTED",
    "EXPIRED",
    "IN_PROGRESS",
    "READY",
  ]),
  cancels: z
    .array(
      z.object({
        transactionKey: z.string(),
        cancelAmount: z.number().int(),
        cancelStatus: z.string(),
      }),
    )
    .nullish(),
});
export type VerifiedPayment = z.infer<typeof payment>;
/** Test-key contract only. Must not be enabled until owner approves a separately reviewed transport. */
export class TossTestContract {
  constructor(
    private secret: string,
    private transport: Transport = blockedTransport,
  ) {
    if (!secret.startsWith("test_sk_"))
      throw Error("ONLY_TOSS_TEST_KEYS_ALLOWED");
  }
  private headers(key?: string) {
    return {
      Authorization:
        "Basic " + Buffer.from(this.secret + ":").toString("base64"),
      ...(key ? { "Idempotency-Key": key } : {}),
      "Content-Type": "application/json",
    };
  }
  private validate(
    raw: unknown,
    orderId: string,
    amount: number,
    key?: string,
  ) {
    const p = payment.parse(raw);
    if (
      p.orderId !== orderId ||
      p.totalAmount !== amount ||
      (key && p.paymentKey !== key)
    )
      throw Error("PG_RESPONSE_MISMATCH");
    return p;
  }
  async confirm(orderId: string, paymentKey: string, amount: number) {
    if (!isSupportedOrderAmount(amount)) throw Error("PRICE_MISMATCH");
    const raw = await this.transport({
      method: "POST",
      path: "/v1/payments/confirm",
      headers: this.headers("confirm-" + orderId),
      body: { orderId, paymentKey, amount },
      timeoutMs: 10000,
    });
    const p = this.validate(raw, orderId, amount, paymentKey);
    if (p.status !== "DONE") throw Error("PAYMENT_NOT_SETTLED");
    return p;
  }
  async lookup(orderId: string, amount = PRODUCT_PRICE_KRW) {
    const raw = await this.transport({
      method: "GET",
      path: "/v1/payments/orders/" + encodeURIComponent(orderId),
      headers: this.headers(),
      timeoutMs: 10000,
    });
    return this.validate(raw, orderId, amount);
  }
  async cancel(
    orderId: string,
    paymentKey: string,
    reason: string,
    amount = PRODUCT_PRICE_KRW,
  ) {
    if (!isSupportedOrderAmount(amount)) throw Error("PRICE_MISMATCH");
    if (reason.length < 5 || reason.length > 200)
      throw Error("INVALID_CANCEL_REASON");
    const raw = await this.transport({
      method: "POST",
      path: "/v1/payments/" + encodeURIComponent(paymentKey) + "/cancel",
      headers: this.headers("cancel-" + orderId),
      body: { cancelReason: reason, cancelAmount: amount },
      timeoutMs: 10000,
    });
    const p = this.validate(raw, orderId, amount, paymentKey);
    if (
      p.status !== "CANCELED" ||
      !p.cancels?.some(
        (c) => c.cancelStatus === "DONE" && c.cancelAmount === amount,
      )
    )
      throw Error("REFUND_NOT_CONFIRMED");
    return p;
  }
}
