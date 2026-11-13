import { describe, it, expect } from "vitest";
import { TossTestContract } from "../lib/integrations/toss";
import type { HttpRequest } from "../lib/integrations/contracts";
const p = {
  paymentKey: "test-payment",
  orderId: "test-order",
  totalAmount: 33000,
  status: "DONE",
};
describe("Toss v1 offline contract (not real sandbox verification)", () => {
  it("blocks live key and default external transport", async () => {
    expect(() => new TossTestContract("live_sk_never")).toThrow();
    await expect(
      new TossTestContract("test_sk_synthetic").confirm(
        p.orderId,
        p.paymentKey,
        33000,
      ),
    ).rejects.toThrow("NOT_APPROVED");
  });
  it("uses server amount and stable idempotency key", async () => {
    const seen: HttpRequest[] = [];
    const t = new TossTestContract("test_sk_synthetic", async (r) => {
      seen.push(r);
      return p;
    });
    await t.confirm(p.orderId, p.paymentKey, 33000);
    await t.confirm(p.orderId, p.paymentKey, 33000);
    expect(seen[0].headers["Idempotency-Key"]).toBe(
      seen[1].headers["Idempotency-Key"],
    );
    expect(seen[0].body).toEqual({
      orderId: p.orderId,
      paymentKey: p.paymentKey,
      amount: 33000,
    });
    expect(seen[0].timeoutMs).toBe(10000);
    await expect(t.confirm(p.orderId, p.paymentKey, 1)).rejects.toThrow();
  });
  it.each([
    { ...p, totalAmount: 1 },
    { ...p, orderId: "other" },
    { ...p, paymentKey: "other" },
    { ...p, status: "WAITING_FOR_DEPOSIT" },
  ])(
    "does not grant access for mismatched/unsettled PG response %j",
    async (response) => {
      const t = new TossTestContract("test_sk_synthetic", async () => response);
      await expect(t.confirm(p.orderId, p.paymentKey, 33000)).rejects.toThrow();
    },
  );
  it("uses lookup by order for reconciliation, including safe URL encoding", async () => {
    const t = new TossTestContract("test_sk_synthetic", async (r) => {
      expect(r.path).toBe("/v1/payments/orders/test-order");
      expect(r.method).toBe("GET");
      return p;
    });
    expect((await t.lookup(p.orderId)).status).toBe("DONE");
  });
  it("requires cancellation outcome, not just a successful HTTP call", async () => {
    const t = new TossTestContract("test_sk_synthetic", async () => p);
    await expect(
      t.cancel(p.orderId, p.paymentKey, "시험 환불 사유"),
    ).rejects.toThrow("REFUND_NOT_CONFIRMED");
    const good = new TossTestContract("test_sk_synthetic", async () => ({
      ...p,
      status: "CANCELED",
      cancels: [
        { transactionKey: "c1", cancelAmount: 33000, cancelStatus: "DONE" },
      ],
    }));
    expect(
      (await good.cancel(p.orderId, p.paymentKey, "시험 환불 사유"))
        .cancels?.[0].transactionKey,
    ).toBe("c1");
  });
  it("propagates timeouts to durable retry handling without inventing paid state", async () => {
    const t = new TossTestContract("test_sk_synthetic", async () => {
      throw Error("TIMEOUT");
    });
    await expect(t.confirm(p.orderId, p.paymentKey, 33000)).rejects.toThrow(
      "TIMEOUT",
    );
  });
});
