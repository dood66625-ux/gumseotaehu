/** Explicit staging only: source orders stay untouched; no worker or network side effects. */
import { statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { encryptJson } from "./crypto";
import { retainRecord } from "./retained-records";
export function stageOrderRetention(
  source: DatabaseSync,
  vault: DatabaseSync,
  options: {
    enabled?: boolean;
    key?: Buffer;
    holdsReviewedAt?: number;
    heldOrders?: ReadonlySet<string>;
    afterId?: string;
    limit?: number;
    now?: number;
  } = {},
) {
  if (!options.enabled) return { enabled: false, staged: 0, nextCursor: null };
  const sourceFile = source
    .prepare("PRAGMA database_list")
    .all()
    .find((r) => r.name === "main")?.file;
  const vaultFile = vault
    .prepare("PRAGMA database_list")
    .all()
    .find((r) => r.name === "main")?.file;
  if (sourceFile && vaultFile) {
    const a = statSync(String(sourceFile)),
      b = statSync(String(vaultFile));
    if (a.dev === b.dev && a.ino === b.ino)
      throw Error("SEPARATE_IDLE_RETENTION_DATABASES_REQUIRED");
  }
  const now = options.now ?? Date.now(),
    count = options.limit ?? 100;
  if (source === vault || source.isTransaction || vault.isTransaction)
    throw Error("SEPARATE_IDLE_RETENTION_DATABASES_REQUIRED");
  if (
    !options.key ||
    options.key.length !== 32 ||
    !options.heldOrders ||
    !Number.isSafeInteger(options.holdsReviewedAt) ||
    options.holdsReviewedAt! > now ||
    now - options.holdsReviewedAt! > 86400000 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1000
  )
    throw Error("RETENTION_STAGING_REVIEW_REQUIRED");
  source.exec("BEGIN");
  try {
    vault.exec("BEGIN IMMEDIATE");
    const rows = source
      .prepare(
        `SELECT o.id,o.amount,o.payment_status,o.payment_key,o.created,o.paid_at,o.email_enc,o.consent_enc,(SELECT COUNT(*) FROM refunds WHERE order_id=o.id) AS refund_count,(SELECT COUNT(*) FROM refunds WHERE order_id=o.id AND (status!='completed' OR status IS NULL OR resolved IS NULL)) AS unresolved_refunds,(SELECT MAX(resolved) FROM refunds WHERE order_id=o.id) AS resolved,(SELECT COUNT(*) FROM tickets WHERE order_id=o.id AND status NOT IN ('closed','resolved')) AS disputes,(SELECT COUNT(*) FROM jobs WHERE order_id=o.id AND state NOT IN ('done','canceled')) AS work FROM orders o WHERE o.id>? AND o.payment_status!='pending' ORDER BY o.id LIMIT ?`,
      )
      .all(options.afterId ?? "", count);
    for (const row of rows) {
      const paid = Number(row.paid_at),
        resolved = row.resolved === null ? null : Number(row.resolved),
        created = Number(row.created);
      const settled =
        (row.payment_status === "paid" && row.refund_count === 0) ||
        (row.payment_status === "refunded" &&
          row.refund_count === 1 &&
          row.unresolved_refunds === 0 &&
          resolved !== null &&
          resolved >= paid);
      if (
        !Number.isSafeInteger(created) ||
        created <= 0 ||
        created > now ||
        !Number.isSafeInteger(paid) ||
        paid < created ||
        paid > now ||
        (resolved !== null &&
          (!Number.isSafeInteger(resolved) || resolved > now))
      )
        throw Error("RETENTION_SOURCE_DATES_REQUIRE_REVIEW");
      const payload = {
        version: 1,
        orderId: row.id,
        amount: row.amount,
        paymentStatus: row.payment_status,
        paymentKey: row.payment_key,
        created,
        paidAt: paid,
        refundResolved: resolved,
        emailEncrypted: row.email_enc,
        consentEncrypted: row.consent_enc,
      };
      retainRecord(vault, {
        id: "order:" + row.id,
        kind: "transaction",
        payloadEncrypted: encryptJson(payload, options.key),
        eventAt: paid,
        closedAt: resolved,
        legalHold:
          options.heldOrders.has(String(row.id)) || Number(row.disputes) > 0,
        activeWork: Number(row.work) > 0,
        settled,
      });
    }
    source.exec("COMMIT");
    vault.exec("COMMIT");
    return {
      enabled: true,
      staged: rows.length,
      nextCursor: rows.length ? String(rows.at(-1)!.id) : null,
    };
  } catch (error) {
    if (source.isTransaction) source.exec("ROLLBACK");
    if (vault.isTransaction) vault.exec("ROLLBACK");
    throw error;
  }
}
