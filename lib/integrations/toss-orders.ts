import { isSupportedOrderAmount } from "../product";
/** Durable PG/order coordination. Test and enrolled live transports remain separate. */
import { z } from "zod";
import { all, one, run, tx } from "../db";
import { audit, event, Fault, hash, id, limit, open, seal } from "../security";
import { requireRecentAdmin } from "../admin-auth";
import {
  ownOrder,
  reconcile,
  reconcileRefunds,
  type Session,
} from "../service";
import type { TossTestContract, VerifiedPayment } from "./toss";
type Gateway = Pick<TossTestContract, "confirm" | "lookup" | "cancel">;
const keySchema = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => !/[\x00-\x1f\x7f]/.test(v));
const evidence = z.object({
  paymentKey: keySchema,
  orderId: z.string().uuid(),
  mId: z.string().min(1).max(100),
  currency: z.literal("KRW"),
  type: z.literal("NORMAL"),
  totalAmount: z.number().int().refine(isSupportedOrderAmount),
  balanceAmount: z.number().int().min(0).max(33000),
  status: z.string(),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
  cancels: z
    .array(
      z.object({
        transactionKey: z.string().min(1).max(200),
        cancelAmount: z.number().int().nonnegative(),
        cancelStatus: z.string(),
      }),
    )
    .nullish(),
});
type Claim = {
  orderId: string;
  key: string;
  amount: number;
  generation: number;
  notificationId: number;
  first: boolean;
};
export type TossOrderResult = {
  state: "verified" | "refunded" | "processing" | "review";
};
export class TossOrderCoordinator {
  constructor(
    private gateway: Gateway,
    private merchantId: string,
    private environment: "test" | "live" = "test",
  ) {
    z.string().min(1).max(100).parse(merchantId);
  }
  async confirm(
    s: Session,
    orderId: string,
    paymentKey: string,
    amount: number,
  ): Promise<TossOrderResult> {
    const order = ownOrder(s, z.string().uuid().parse(orderId));
    const key = keySchema.parse(paymentKey);
    if (!isSupportedOrderAmount(order.amount) || amount !== order.amount)
      throw new Fault("주문금액 검증에 실패했습니다.");
    const old = one("SELECT * FROM toss_attempts WHERE order_id=?", orderId);
    if (old && (old.payment_key !== key || old.merchant_id !== this.merchantId))
      throw new Fault("이미 연결된 결제와 다릅니다.", 409);
    if (!old && order.content_deleted)
      throw new Fault("삭제된 주문은 결제할 수 없습니다.", 409);
    if (!old && order.payment_status !== "pending")
      throw new Fault("결제 승인 대상 주문이 아닙니다.", 409);
    if (
      old?.state === "verified" &&
      order.payment_status === "paid" &&
      !old.needs_check
    )
      return { state: "verified" };
    if (order.payment_status === "refunded") return { state: "refunded" };
    if (!old && one("SELECT order_id FROM pg_ledger WHERE order_id=?", orderId))
      throw new Fault("다른 결제 경로의 원장을 먼저 확인해 주세요.", 409);
    const claim = this.claim(orderId, key);
    if (!claim) return { state: "processing" };
    return this.execute(claim, () =>
      claim.first
        ? this.gateway.confirm(orderId, key, order.amount)
        : this.gateway.lookup(orderId, order.amount, claim.key),
    );
  }
  private claim(orderId: string, key?: string): Claim | null {
    return tx(() => {
      const now = Date.now();
      let attempt = one(
        "SELECT * FROM toss_attempts WHERE order_id=?",
        orderId,
      );
      const first = !attempt;
      if (!attempt) {
        if (
          key &&
          one("SELECT order_id FROM toss_attempts WHERE payment_key=?", key)
        )
          throw new Fault("이미 다른 주문에 연결된 결제입니다.", 409);
        if (!key) throw new Fault("결제 확인 요청이 없습니다.", 404);
        run(
          "INSERT INTO toss_attempts(order_id,payment_key,merchant_id,state,refund_reason_enc,created,updated) VALUES(?,?,?,?,?,?,?)",
          orderId,
          key,
          this.merchantId,
          "confirming",
          seal(null),
          now,
          now,
        );
        attempt = one("SELECT * FROM toss_attempts WHERE order_id=?", orderId)!;
      }
      if (attempt.merchant_id !== this.merchantId)
        throw new Fault("결제 상점 설정을 확인해 주세요.", 409);
      if (key && attempt.payment_key !== key)
        throw new Fault("결제 연결이 다릅니다.", 409);
      if (attempt.lease_until > now) return null;
      run(
        "UPDATE toss_attempts SET generation=generation+1,lease_until=?,needs_check=0,updated=? WHERE order_id=?",
        now + 30000,
        now,
        orderId,
      );
      return {
        orderId,
        key: attempt.payment_key,
        amount: Number(
          one("SELECT amount FROM orders WHERE id=?", orderId)!.amount,
        ),
        generation: attempt.generation + 1,
        first,
        notificationId: Number(
          one(
            "SELECT COALESCE(MAX(id),0) n FROM toss_notifications WHERE order_id=?",
            orderId,
          )!.n,
        ),
      };
    });
  }
  private async execute(
    claim: Claim,
    request: () => Promise<VerifiedPayment>,
  ): Promise<TossOrderResult> {
    try {
      const raw = await request(),
        p = evidence.parse(raw);
      const order = one("SELECT * FROM orders WHERE id=?", claim.orderId)!;
      if (
        p.orderId !== claim.orderId ||
        p.paymentKey !== claim.key ||
        p.mId !== this.merchantId ||
        p.totalAmount !== order.amount
      )
        throw Error("PG_RESPONSE_MISMATCH");
      if (
        p.approvedAt &&
        (Date.parse(p.approvedAt) > Date.now() + 60000 ||
          Date.parse(p.approvedAt) < order.created - 60000)
      )
        throw Error("PG_TIME_MISMATCH");
      const result = tx(() => {
        const current = one(
          "SELECT * FROM toss_attempts WHERE order_id=?",
          claim.orderId,
        )!;
        if (
          current.generation !== claim.generation ||
          current.lease_until === 0
        ) {
          run(
            "UPDATE toss_attempts SET needs_check=1,next_check=0 WHERE order_id=?",
            claim.orderId,
          );
          return { state: "processing" as const };
        }
        const live = one("SELECT * FROM orders WHERE id=?", claim.orderId)!;
        let state: TossOrderResult["state"] = "review";
        if (live.payment_status === "refunded") state = "refunded";
        else if (
          p.status === "DONE" &&
          p.balanceAmount === live.amount &&
          p.approvedAt
        ) {
          const ledger = one(
            "SELECT * FROM pg_ledger WHERE order_id=?",
            live.id,
          );
          if (
            ledger &&
            (ledger.payment_key !== p.paymentKey ||
              ledger.amount !== p.totalAmount ||
              ledger.status === "CANCELED")
          )
            throw Error("PG_LEDGER_CONFLICT");
          run(
            "INSERT INTO pg_ledger(payment_key,order_id,amount,status) VALUES(?,?,?,'DONE') ON CONFLICT(order_id) DO NOTHING",
            p.paymentKey,
            live.id,
            p.totalAmount,
          );
          state =
            live.payment_status === "refund_pending" ? "review" : "verified";
        } else if (
          p.status === "CANCELED" &&
          p.balanceAmount === 0 &&
          p.approvedAt
        ) {
          const done =
            p.cancels?.filter((c) => c.cancelStatus === "DONE") ?? [];
          if (done.length !== 1 || done[0].cancelAmount !== live.amount)
            throw Error("FULL_CANCEL_NOT_VERIFIED");
          if (live.payment_status === "pending") {
            const ledger = one(
              "SELECT * FROM pg_ledger WHERE order_id=?",
              live.id,
            );
            if (
              ledger &&
              (ledger.payment_key !== p.paymentKey ||
                ledger.amount !== live.amount)
            )
              throw Error("PG_LEDGER_CONFLICT");
            const approved = Date.parse(p.approvedAt),
              expiry = new Date(approved);
            expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
            run(
              "INSERT INTO pg_ledger(payment_key,order_id,amount,status) VALUES(?,?,?,'DONE') ON CONFLICT(order_id) DO NOTHING",
              p.paymentKey,
              live.id,
              live.amount,
            );
            run(
              "UPDATE orders SET payment_key=?,paid_at=?,expires=? WHERE id=?",
              p.paymentKey,
              approved,
              expiry.getTime(),
              live.id,
            );
            event("payment_confirmed", live.id);
          } else if (
            !["paid", "refund_pending"].includes(live.payment_status) ||
            live.payment_key !== p.paymentKey
          )
            throw Error("CANCEL_REQUIRES_PAYMENT_REVIEW");
          run(
            "INSERT OR IGNORE INTO refunds(id,order_id,amount,reason_enc,status,created) VALUES(?,?,?,?,?,?)",
            id(),
            live.id,
            live.amount,
            seal({
              reason: "독립 결제 조회에서 확인된 전액 취소",
              actor: "toss-" + this.environment + "-reconciliation",
            }),
            "pending",
            Date.now(),
          );
          run(
            "UPDATE orders SET payment_status='refund_pending' WHERE id=?",
            live.id,
          );
          const changed = run(
            "UPDATE pg_ledger SET status='CANCELED',cancel_id=? WHERE order_id=? AND payment_key=? AND amount=?",
            done[0].transactionKey,
            live.id,
            p.paymentKey,
            live.amount,
          );
          if (changed.changes !== 1) throw Error("CANCEL_LEDGER_MISSING");
          state = "refunded";
        }
        run(
          "UPDATE toss_attempts SET state=?,lease_until=0,failures=0,checked_at=?,last_error=?,last_status=?,next_check=?,needs_check=MAX(needs_check,?),approved_at=COALESCE(approved_at,?),updated=? WHERE order_id=? AND generation=?",
          state,
          Date.now(),
          state === "review" ? "UNSETTLED_OR_UNSUPPORTED" : null,
          p.status,
          state === "review" ? Date.now() + 30000 : 0,
          ["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"].includes(p.status)
            ? 1
            : 0,
          p.approvedAt ? Date.parse(p.approvedAt) : null,
          Date.now(),
          live.id,
          claim.generation,
        );
        if (state !== "review")
          run(
            "UPDATE toss_notifications SET processed=? WHERE order_id=? AND id<=? AND processed IS NULL",
            Date.now(),
            live.id,
            claim.notificationId,
          );
        audit(
          "toss-" + this.environment,
          "provider_evidence_" + state,
          live.id,
        );
        return { state };
      });
      // A crash here leaves independently verified ledger evidence for the regular worker.
      reconcile();
      reconcileRefunds();
      return result;
    } catch {
      run(
        "UPDATE toss_attempts SET state=CASE WHEN failures>=7 THEN 'review' ELSE 'uncertain' END,lease_until=0,needs_check=CASE WHEN failures>=7 THEN 0 ELSE 1 END,failures=failures+1,last_error='VERIFICATION_UNAVAILABLE',next_check=?,updated=? WHERE order_id=? AND generation=? AND lease_until>0",
        Date.now() + Math.min(60000, 1000 * 2 ** Math.min(claim.generation, 6)),
        Date.now(),
        claim.orderId,
        claim.generation,
      );
      throw new Fault(
        "결제 상태를 확인 중입니다. 추가 결제 없이 같은 주문으로 다시 확인해 주세요.",
        503,
      );
    }
  }
  async recover(orderId: string): Promise<TossOrderResult> {
    const claim = this.claim(z.string().uuid().parse(orderId));
    if (!claim) return { state: "processing" };
    return this.execute(claim, () =>
      this.gateway.lookup(orderId, claim.amount, claim.key),
    );
  }
  async refund(
    s: Session,
    orderId: string,
    reason: string,
  ): Promise<TossOrderResult> {
    requireRecentAdmin(s, ["operations", "finance"]);
    z.string().trim().min(5).max(200).parse(reason);
    tx(() => {
      const order = one("SELECT * FROM orders WHERE id=?", orderId),
        attempt = one("SELECT * FROM toss_attempts WHERE order_id=?", orderId);
      if (
        !order ||
        !attempt ||
        attempt.merchant_id !== this.merchantId ||
        order.payment_key !== attempt.payment_key
      )
        throw new Fault("결제 환불 대상을 확인해 주세요.", 409);
      if (
        !["paid", "refund_pending", "refunded"].includes(order.payment_status)
      )
        throw new Fault("확인된 결제가 없습니다.");
      if (order.payment_status === "refunded") return;
      if (open(attempt.refund_reason_enc) === null)
        run(
          "UPDATE toss_attempts SET refund_reason_enc=? WHERE order_id=?",
          seal(reason.trim()),
          orderId,
        );
      run(
        "INSERT OR IGNORE INTO refunds(id,order_id,amount,reason_enc,status,created) VALUES(?,?,?,?,?,?)",
        id(),
        orderId,
        order.amount,
        seal({ reason: reason.trim(), actor: s.id }),
        "pending",
        Date.now(),
      );
      run(
        "UPDATE orders SET payment_status='refund_pending' WHERE id=?",
        orderId,
      );
      audit(s.id, "toss_test_refund_requested", orderId);
    });
    if (
      one("SELECT payment_status FROM orders WHERE id=?", orderId)
        ?.payment_status === "refunded"
    )
      return { state: "refunded" };
    const claim = this.claim(orderId);
    if (!claim) return { state: "processing" };
    const shouldCancel = tx(() => {
      const attempt = one(
        "SELECT * FROM toss_attempts WHERE order_id=?",
        orderId,
      )!;
      if (attempt.refund_dispatched) return false;
      run(
        "UPDATE toss_attempts SET refund_dispatched=1 WHERE order_id=?",
        orderId,
      );
      return true;
    });
    return this.execute(claim, () =>
      shouldCancel
        ? this.gateway.cancel(
            orderId,
            claim.key,
            "디지털콘텐츠 주문 전액 취소",
            claim.amount,
          )
        : this.gateway.lookup(orderId, claim.amount, claim.key),
    );
  }
  /** Fresh lookup first; resubmit only on an explicit request and an authenticated IN_PROGRESS payment. */
  async retryApproval(s: Session, orderId: string): Promise<TossOrderResult> {
    const order = ownOrder(s, orderId),
      attempt = one("SELECT * FROM toss_attempts WHERE order_id=?", orderId);
    if (
      order.payment_status !== "pending" ||
      !attempt ||
      attempt.state !== "review" ||
      attempt.last_status !== "IN_PROGRESS" ||
      !attempt.checked_at ||
      Date.now() - attempt.checked_at > 5 * 60000
    )
      throw new Fault(
        "최근 결제 상태를 조회한 후 승인 재시도를 요청해 주세요.",
        409,
      );
    const claim = this.claim(orderId);
    if (!claim) return { state: "processing" };
    return this.execute(claim, async () => {
      const before = evidence.parse(
        await this.gateway.lookup(orderId, order.amount, claim.key),
      );
      if (
        before.orderId !== orderId ||
        before.paymentKey !== claim.key ||
        before.mId !== this.merchantId
      )
        throw Error("PG_PREFLIGHT_MISMATCH");
      if (before.status !== "IN_PROGRESS") return before as VerifiedPayment;
      if (before.balanceAmount !== order.amount || before.approvedAt !== null)
        throw Error("PG_PREFLIGHT_MISMATCH");
      return this.gateway.confirm(orderId, claim.key, order.amount);
    });
  }
  /** Explicit retry only after a recent independent lookup; original cancel body/key stays stable. */
  async retryRefund(s: Session, orderId: string): Promise<TossOrderResult> {
    requireRecentAdmin(s, ["operations", "finance"]);
    const row = one(
      "SELECT t.*,r.created AS refund_created FROM toss_attempts t JOIN refunds r ON r.order_id=t.order_id WHERE t.order_id=?",
      orderId,
    );
    if (
      !row ||
      row.merchant_id !== this.merchantId ||
      row.state !== "review" ||
      row.last_status !== "DONE" ||
      !row.checked_at ||
      Date.now() - row.checked_at > 5 * 60000 ||
      Date.now() - row.refund_created > 14 * 86400000
    )
      throw new Fault(
        "최근 결제 조회와 환불 대기 상태를 먼저 확인해 주세요.",
        409,
      );
    const changed = run(
      "UPDATE toss_attempts SET refund_dispatched=0 WHERE order_id=? AND generation=? AND lease_until<=?",
      orderId,
      row.generation,
      Date.now(),
    );
    if (!changed.changes) return { state: "processing" };
    return this.refund(s, orderId, open<string>(row.refund_reason_enc));
  }
  /** Untrusted body only queues lookup of an already-bound order; it never settles payment. */
  notify(body: unknown) {
    limit("toss-" + this.environment + "-notification", 100, 60000);
    const n = z
      .object({
        orderId: z.string().uuid(),
        eventId: z.string().min(1).max(200),
      })
      .parse(body);
    return tx(() => {
      if (
        !one(
          "SELECT order_id FROM toss_attempts WHERE order_id=? AND merchant_id=?",
          n.orderId,
          this.merchantId,
        )
      )
        return { queued: false };
      const inserted = run(
        "INSERT OR IGNORE INTO toss_notifications(event_key,order_id,received) VALUES(?,?,?)",
        hash(n.orderId + ":" + n.eventId),
        n.orderId,
        Date.now(),
      );
      if (inserted.changes)
        run(
          "UPDATE toss_attempts SET needs_check=1,next_check=0 WHERE order_id=?",
          n.orderId,
        );
      return { queued: !!inserted.changes };
    });
  }
  async recoverPending() {
    const rows = all(
      "SELECT order_id FROM toss_attempts WHERE merchant_id=? AND lease_until<=? AND next_check<=? AND (needs_check=1 OR state IN ('confirming','uncertain')) ORDER BY updated LIMIT 20",
      this.merchantId,
      Date.now(),
      Date.now(),
    );
    const results = [];
    for (const row of rows) {
      try {
        results.push({
          orderId: row.order_id,
          ...(await this.recover(row.order_id)),
        });
      } catch {
        results.push({ orderId: row.order_id, state: "uncertain" });
      }
    }
    return results;
  }
}
