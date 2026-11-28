import { expect, it } from "vitest";
import {
  customerOrderState,
  customerPaymentLabel,
} from "../lib/customer-order-state";
const now = 1800000000000;
const paid = {
  payment: "paid",
  fulfillment: "ready",
  expires: now + 1000,
  deleted: false,
};
it.each([
  [{ ...paid }, "ready"],
  [{ ...paid, payment: "pending" }, "pending"],
  [{ ...paid, fulfillment: "working" }, "working"],
  [{ ...paid, fulfillment: "generating" }, "working"],
  [{ ...paid, fulfillment: "failed" }, "failed"],
  [{ ...paid, fulfillment: "retrying", generationHeld: true }, "held"],
  [{ ...paid, payment: "refunded", generationHeld: true }, "refunded"],
  [{ ...paid, payment: "refund_pending" }, "refund_pending"],
  [{ ...paid, payment: "refunded" }, "refunded"],
  [{ ...paid, deleted: true }, "deleted"],
  [{ ...paid, expires: now }, "expired"],
  [{ ...paid, payment: "unexpected" }, "unknown"],
  [{ ...paid, expires: null }, "unknown"],
  [{ ...paid, expires: NaN }, "unknown"],
] as const)(
  "classifies observed order %j as %s without granting server access",
  (order, state) => {
    const view = customerOrderState(order, now);
    expect(view.state).toBe(state);
    expect(view.canRead).toBe(state === "ready");
    if (
      ["refunded", "deleted", "expired", "refund_pending", "unknown"].includes(
        state,
      )
    )
      expect(view.canChangeEmail).toBe(false);
  },
);
it("payment cancellation and deletion override stale ready fulfillment", () => {
  expect(
    customerOrderState({ ...paid, payment: "refunded", deleted: true }, now)
      .state,
  ).toBe("refunded");
  expect(
    customerOrderState({ ...paid, payment: "refund_pending" }, now).canRead,
  ).toBe(false);
  expect(customerOrderState({ ...paid, expires: now - 1 }, now).terminal).toBe(
    true,
  );
});

it.each([
  ["paid", "결제 완료"],
  ["pending", "결제 확인 중"],
  ["refund_pending", "취소 확인 중"],
  ["refunded", "전액 취소 완료"],
  ["unexpected-internal-state", "확인 필요"],
])("presents payment %s without exposing internal values", (value, label) => {
  expect(customerPaymentLabel(value)).toBe(label);
});
