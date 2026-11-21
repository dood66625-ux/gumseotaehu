/** Read-only planning. A review candidate is never an authorization to delete. */
import { z } from "zod";
export const retentionPolicySchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal("review-only"),
    transactionYears: z.number().int().min(1).max(20),
    reviewedAt: z.number().int().positive(),
    holdsReviewed: z.literal(true),
    heldOrders: z.array(z.string().uuid()).max(10000),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export type RetentionRecord = {
  id: string;
  created: number;
  paidAt: number | null;
  refundResolved: number | null;
  payment: string;
  openDisputes: number;
  activeWork: number;
  refundCount: number;
  unresolvedRefunds: number;
};
export function retentionDecision(
  record: RetentionRecord,
  policy: RetentionPolicy,
  now = Date.now(),
) {
  if (
    !Number.isSafeInteger(now) ||
    policy.reviewedAt > now ||
    now - policy.reviewedAt > 86400000
  )
    return "policy-review-required";
  if (policy.heldOrders.includes(record.id)) return "legal-hold";
  if (record.openDisputes > 0) return "open-dispute";
  if (
    ![
      record.openDisputes,
      record.activeWork,
      record.refundCount,
      record.unresolvedRefunds,
    ].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    return "invalid-record-state";
  if (record.unresolvedRefunds > 0) return "unresolved-refund";
  if (
    (record.payment === "paid" && record.refundCount !== 0) ||
    (record.payment === "refunded" && record.refundCount !== 1)
  )
    return "financial-review-required";
  if (record.activeWork > 0) return "active-work";
  if (!["paid", "refunded"].includes(record.payment))
    return "unsettled-payment";
  if (
    !Number.isSafeInteger(record.created) ||
    record.created <= 0 ||
    record.created > now ||
    !record.paidAt ||
    !Number.isSafeInteger(record.paidAt) ||
    record.paidAt < record.created ||
    record.paidAt > now
  )
    return "invalid-dates";
  if (
    record.payment === "refunded" &&
    (!record.refundResolved || record.refundResolved < record.paidAt)
  )
    return "invalid-dates";
  const anchor = Math.max(
    record.created,
    record.paidAt,
    record.refundResolved ?? 0,
  );
  if (!Number.isSafeInteger(anchor) || anchor > now) return "invalid-dates";
  const cutoff = new Date(anchor);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() + policy.transactionYears);
  return now >= cutoff.getTime() ? "expired-review-candidate" : "retain";
}
