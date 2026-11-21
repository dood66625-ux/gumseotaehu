import { z } from "zod";
import { isSupportedOrderAmount } from "../product";
import { blockedTransport, type Transport } from "./contracts";
import { tossPaymentSchema } from "./toss";
/** Full cancellation requires a separate explicit capability; default remains approval/query only. */
export class TossLiveContract {
  constructor(
    private secret: string,
    private merchantId: string,
    private transport: Transport = blockedTransport,
    private allowCancel = false,
  ) {
    if (!/^live_(?:gsk|sk)_[A-Za-z0-9_]{8,500}$/.test(secret))
      throw Error("ONLY_TOSS_LIVE_KEYS_ALLOWED");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(merchantId))
      throw Error("TOSS_LIVE_MERCHANT_REQUIRED");
  }
  private request(
    orderId: string,
    key: string,
    amount: number,
    confirming: boolean,
  ) {
    z.string().uuid().parse(orderId);
    if (!key || key.length > 200 || /[\x00-\x1f\x7f]/.test(key))
      throw Error("PAYMENT_KEY_REQUIRED");
    if (!isSupportedOrderAmount(amount)) throw Error("PRICE_MISMATCH");
    return this.transport({
      method: confirming ? "POST" : "GET",
      path: confirming
        ? "/v1/payments/confirm"
        : "/v1/payments/" + encodeURIComponent(key),
      headers: {
        Authorization:
          "Basic " + Buffer.from(this.secret + ":").toString("base64"),
        "Content-Type": "application/json",
        ...(confirming ? { "Idempotency-Key": "live-confirm-" + orderId } : {}),
      },
      ...(confirming ? { body: { orderId, paymentKey: key, amount } } : {}),
      timeoutMs: 10000,
    });
  }
  private validate(raw: unknown, orderId: string, key: string, amount: number) {
    const p = tossPaymentSchema.parse(raw);
    if (
      p.orderId !== orderId ||
      p.paymentKey !== key ||
      p.totalAmount !== amount ||
      p.mId !== this.merchantId ||
      p.currency !== "KRW" ||
      p.type !== "NORMAL"
    )
      throw Error("PG_RESPONSE_MISMATCH");
    return p;
  }
  async confirm(orderId: string, key: string, amount: number) {
    const p = this.validate(
      await this.request(orderId, key, amount, true),
      orderId,
      key,
      amount,
    );
    if (p.status !== "DONE") throw Error("PAYMENT_NOT_SETTLED");
    return p;
  }
  async lookup(orderId: string, amount: number, key?: string) {
    if (!key) throw Error("BOUND_PAYMENT_KEY_REQUIRED");
    return this.validate(
      await this.request(orderId, key, amount, false),
      orderId,
      key,
      amount,
    );
  }
  async cancel(orderId: string, key: string, reason: string, amount: number) {
    if (!this.allowCancel) throw Error("TOSS_LIVE_CANCEL_NOT_ENABLED");
    z.string().trim().min(5).max(200).parse(reason);
    // Independent lookup before a financial POST, including external/full cancellation recovery.
    const before = await this.lookup(orderId, amount, key);
    if (before.status === "CANCELED")
      return this.fullCancellation(before, amount);
    if (
      before.status !== "DONE" ||
      before.balanceAmount !== amount ||
      !before.approvedAt ||
      before.cancels?.length
    )
      throw Error("FULL_CANCEL_PREFLIGHT_REQUIRED");
    const raw = await this.transport({
      method: "POST",
      path: "/v1/payments/" + encodeURIComponent(key) + "/cancel",
      headers: {
        Authorization:
          "Basic " + Buffer.from(this.secret + ":").toString("base64"),
        "Content-Type": "application/json",
        "Idempotency-Key": "live-cancel-" + orderId,
      },
      body: { cancelReason: reason.trim(), cancelAmount: amount },
      timeoutMs: 10000,
    });
    return this.fullCancellation(
      this.validate(raw, orderId, key, amount),
      amount,
    );
  }
  private fullCancellation(
    p: ReturnType<typeof tossPaymentSchema.parse>,
    amount: number,
  ) {
    const done = p.cancels?.filter((c) => c.cancelStatus === "DONE") ?? [];
    if (
      p.status !== "CANCELED" ||
      p.balanceAmount !== 0 ||
      !p.approvedAt ||
      done.length !== 1 ||
      done[0].cancelAmount !== amount
    )
      throw Error("FULL_CANCEL_NOT_VERIFIED");
    return p;
  }
}
