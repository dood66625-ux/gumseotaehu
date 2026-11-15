import { expect, it, vi } from "vitest";
import {
  tossTestKeyPair,
  tossTestSecretKind,
} from "../lib/integrations/toss-key-profile.mjs";
import { TossTestContract } from "../lib/integrations/toss";
import { createTossTestTransport } from "../lib/integrations/toss-http";
const p = {
  paymentKey: "opaque / payment?한글",
  orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  mId: "fixture-mid",
  currency: "KRW",
  type: "NORMAL",
  totalAmount: 22000,
  balanceAmount: 22000,
  status: "DONE",
  approvedAt: new Date().toISOString(),
};
it("recognizes matching widget/individual test families without claiming key validity", () => {
  expect(tossTestKeyPair("test_gck_fixture", "test_gsk_fixture")).toBe(
    "widget",
  );
  expect(tossTestKeyPair("test_ck_fixture", "test_sk_fixture")).toBe(
    "individual",
  );
});
it.each([
  ["test_gck_fixture", "test_sk_fixture"],
  ["test_ck_fixture", "test_gsk_fixture"],
  ["live_gck_fixture", "live_gsk_fixture"],
  ["test_gck_fixture", "live_gsk_fixture"],
])("rejects mixed or live key families (%s)", (client, secret) =>
  expect(() => tossTestKeyPair(client, secret)).toThrow(),
);
it("widget recovery requires the already-bound payment key and validates order/amount/key", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(p));
  const gateway = new TossTestContract(
    "test_gsk_fixture",
    createTossTestTransport({ enabled: true, fetch: send }),
  );
  await expect(gateway.lookup(p.orderId)).rejects.toThrow(
    "REQUIRES_BOUND_PAYMENT_KEY",
  );
  expect(send).not.toHaveBeenCalled();
  expect(await gateway.lookup(p.orderId, 22000, p.paymentKey)).toMatchObject(p);
  expect(send.mock.calls[0][0]).toBe(
    "https://api.tosspayments.com/v1/payments/" +
      encodeURIComponent(p.paymentKey),
  );
  send.mockResolvedValue(Response.json({ ...p, paymentKey: "another-key" }));
  await expect(gateway.lookup(p.orderId, 22000, p.paymentKey)).rejects.toThrow(
    "PG_RESPONSE_MISMATCH",
  );
});
it("blocks unsupported widget order-ID lookup even if called directly through HTTP transport", async () => {
  const send = vi.fn<typeof fetch>();
  const t = createTossTestTransport({ enabled: true, fetch: send });
  await expect(
    t({
      method: "GET",
      path: "/v1/payments/orders/" + p.orderId,
      headers: {
        Authorization:
          "Basic " + Buffer.from("test_gsk_fixture:").toString("base64"),
      },
      timeoutMs: 10000,
    }),
  ).rejects.toThrow("WIDGET_ORDER_LOOKUP_NOT_SUPPORTED");
  expect(send).not.toHaveBeenCalled();
});
it("widget confirm and full cancel retain server amounts and stable idempotency keys", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(p))
    .mockResolvedValueOnce(
      Response.json({
        ...p,
        status: "CANCELED",
        balanceAmount: 0,
        cancels: [
          {
            transactionKey: "opaque-cancel-key",
            cancelAmount: 22000,
            cancelStatus: "DONE",
          },
        ],
      }),
    );
  const t = new TossTestContract(
    "test_gsk_fixture",
    createTossTestTransport({ enabled: true, fetch: send }),
  );
  await t.confirm(p.orderId, p.paymentKey, 22000);
  await t.cancel(p.orderId, p.paymentKey, "합성 주문 전액 취소", 22000);
  expect(JSON.parse(send.mock.calls[0][1]!.body as string).amount).toBe(22000);
  expect(JSON.parse(send.mock.calls[1][1]!.body as string).cancelAmount).toBe(
    22000,
  );
  expect(
    (send.mock.calls[0][1]!.headers as Record<string, string>)[
      "Idempotency-Key"
    ],
  ).toBe("confirm-" + p.orderId);
  expect(
    (send.mock.calls[1][1]!.headers as Record<string, string>)[
      "Idempotency-Key"
    ],
  ).toBe("cancel-" + p.orderId);
});
it("widget test keys never enable the default blocked transport", async () => {
  expect(tossTestSecretKind("test_gsk_fixture")).toBe("widget");
  await expect(
    new TossTestContract("test_gsk_fixture").confirm(
      p.orderId,
      p.paymentKey,
      22000,
    ),
  ).rejects.toThrow("NOT_APPROVED");
});
