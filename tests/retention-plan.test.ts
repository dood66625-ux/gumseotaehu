import { expect, it } from "vitest";
import {
  retentionDecision,
  retentionPolicySchema,
} from "../lib/retention-plan";
const now = Date.UTC(2030, 0, 1),
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const policy = {
  version: 1 as const,
  purpose: "review-only" as const,
  transactionYears: 5,
  reviewedAt: now,
  holdsReviewed: true as const,
  heldOrders: [] as string[],
};
const record = {
  id,
  created: Date.UTC(2020, 0, 1),
  paidAt: Date.UTC(2020, 0, 2),
  refundResolved: null,
  payment: "paid",
  openDisputes: 0,
  activeWork: 0,
};
it("keeps legal holds, disputes, work and pending financial states out of expired candidates", () => {
  expect(retentionDecision(record, { ...policy, heldOrders: [id] }, now)).toBe(
    "legal-hold",
  );
  for (const [changes, reason] of [
    [{ openDisputes: 1 }, "open-dispute"],
    [{ activeWork: 1 }, "active-work"],
    [{ payment: "refund_pending" }, "unsettled-payment"],
  ] as const)
    expect(retentionDecision({ ...record, ...changes }, policy, now)).toBe(
      reason,
    );
});
it("uses the latest refund evidence and calendar-year boundary without early expiry", () => {
  const paidAt = Date.UTC(2025, 0, 1);
  expect(retentionDecision({ ...record, paidAt }, policy, now - 1)).toBe(
    "policy-review-required",
  );
  expect(
    retentionDecision(
      { ...record, paidAt },
      { ...policy, reviewedAt: now - 1000 },
      now - 1,
    ),
  ).toBe("retain");
  expect(retentionDecision({ ...record, paidAt }, policy, now)).toBe(
    "expired-review-candidate",
  );
  expect(
    retentionDecision(
      { ...record, payment: "refunded", refundResolved: Date.UTC(2028, 0, 1) },
      policy,
      now,
    ),
  ).toBe("retain");
});
it("does not make a candidate from stale hold review, unknown payment dates or unresolved refunds", () => {
  expect(
    retentionDecision(record, { ...policy, reviewedAt: now - 86400001 }, now),
  ).toBe("policy-review-required");
  expect(retentionDecision({ ...record, paidAt: null }, policy, now)).toBe(
    "invalid-dates",
  );
  expect(
    retentionDecision({ ...record, payment: "refunded" }, policy, now),
  ).toBe("invalid-dates");
  expect(() =>
    retentionPolicySchema.parse({ ...policy, purpose: "delete" }),
  ).toThrow();
  expect(() =>
    retentionPolicySchema.parse({ ...policy, holdsReviewed: false }),
  ).toThrow();
});
