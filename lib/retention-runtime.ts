/** Approved, bounded source erasure. Disabled by default; external write-ahead ledger required. */
import { randomUUID, createHash } from "node:crypto";
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
  realpathSync,
} from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { config } from "./config";
import {
  configuredExternalLedger,
  type ExternalDeletionLedger,
} from "./external-deletion-ledger";
import {
  collectDeletions,
  deletionIdentity,
  type Deletions,
} from "./deletion-manifest";
import {
  eraseFinancialOrder,
  eraseDispute,
  hasTable,
  finishErasure,
} from "./financial-erasure";
export const erasurePolicySchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal("approved-retention-erasure"),
    sourceId: z.string().uuid(),
    reviewedAt: z.number().int().positive(),
    holdsReviewed: z.literal(true),
    transactionYears: z.literal(5),
    disputeYears: z.literal(3),
    heldOrders: z.array(z.string().uuid()).max(100000),
    heldDisputes: z.array(z.string().uuid()).max(100000),
    closedDisputes: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            closedAt: z.number().int().positive(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type ErasurePolicy = z.infer<typeof erasurePolicySchema>;
function due(at: number, years: number, now: number) {
  if (!Number.isSafeInteger(at) || at <= 0 || at > now) return false;
  const date = new Date(at);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return Number.isFinite(date.getTime()) && date.getTime() <= now;
}
export async function runRetentionCycle(
  db: DatabaseSync,
  options: {
    enabled?: boolean;
    policy?: ErasurePolicy;
    remote?: Pick<ExternalDeletionLedger, "publish">;
    now?: number;
  } = {},
) {
  if (!options.enabled) return { enabled: false, orders: 0, disputes: 0 };
  const now = options.now ?? Date.now(),
    policy = erasurePolicySchema.parse(options.policy),
    remote = options.remote;
  if (
    !remote ||
    !Number.isSafeInteger(now) ||
    policy.reviewedAt > now ||
    now - policy.reviewedAt > 86400000
  )
    throw Error("RETENTION_FRESH_REVIEW_AND_EXTERNAL_LEDGER_REQUIRED");
  if (
    new Set(policy.closedDisputes.map((r) => r.id)).size !==
    policy.closedDisputes.length
  )
    throw Error("RETENTION_DUPLICATE_DISPUTE_REVIEW");
  if (db.isTransaction) throw Error("RETENTION_TOP_LEVEL_TRANSACTION_REQUIRED");
  db.exec("PRAGMA secure_delete=ON; BEGIN IMMEDIATE");
  let committed = false;
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS privacy_checkpoint_source(id INTEGER PRIMARY KEY CHECK(id=1),source_id TEXT NOT NULL)",
    );
    db.prepare(
      "INSERT OR IGNORE INTO privacy_checkpoint_source VALUES(1,?)",
    ).run(randomUUID());
    const sourceId = String(
      db
        .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
        .get()!.source_id,
    );
    if (sourceId !== policy.sourceId) throw Error("RETENTION_SOURCE_MISMATCH");
    db.exec(
      "CREATE TABLE IF NOT EXISTS retention_policy_reviews(reviewed_at INTEGER PRIMARY KEY,digest TEXT NOT NULL,applied_at INTEGER NOT NULL)",
    );
    const policyDigest = createHash("sha256")
      .update(JSON.stringify(policy))
      .digest("hex");
    const priorReview = db
      .prepare(
        "SELECT reviewed_at,digest FROM retention_policy_reviews ORDER BY reviewed_at DESC LIMIT 1",
      )
      .get();
    if (
      priorReview &&
      (Number(priorReview.reviewed_at) > policy.reviewedAt ||
        (Number(priorReview.reviewed_at) === policy.reviewedAt &&
          priorReview.digest !== policyDigest))
    )
      throw Error("RETENTION_POLICY_ROLLBACK_REFUSED");
    db.prepare(
      "INSERT OR IGNORE INTO retention_policy_reviews VALUES(?,?,?)",
    ).run(policy.reviewedAt, policyDigest, now);
    const holds = new Set(policy.heldOrders),
      ticketHolds = new Set(policy.heldDisputes);
    // A closure date is supplied by a fresh operator review, never inferred from ticket creation.
    const disputes: string[] = [];
    for (const closed of policy.closedDisputes) {
      const ticket = db
        .prepare(
          "SELECT id,order_id,status,created,email_hash FROM tickets WHERE id=?",
        )
        .get(closed.id);
      if (
        ticket &&
        Number.isSafeInteger(Number(ticket.created)) &&
        Number(ticket.created) > 0 &&
        !ticketHolds.has(closed.id) &&
        !holds.has(String(ticket.order_id)) &&
        !db
          .prepare("SELECT 1 FROM outbox WHERE email_hash=?")
          .get(ticket.email_hash) &&
        ["closed", "resolved"].includes(String(ticket.status)) &&
        closed.closedAt >= Number(ticket.created) &&
        due(closed.closedAt, 3, now)
      )
        disputes.push(closed.id);
      if (disputes.length === 100) break;
    }
    const reviewedDeleted = new Set(disputes),
      orders: string[] = [];
    // Index on created bounds the candidate scan; date/hold/state checks are repeated under the write lock.
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    db.exec(
      "CREATE INDEX IF NOT EXISTS orders_retention_due ON orders(content_deleted,created,id); CREATE TABLE IF NOT EXISTS retention_scan_cursor(id INTEGER PRIMARY KEY CHECK(id=1),created INTEGER NOT NULL,order_id TEXT NOT NULL)",
    );
    const cursor = db
      .prepare("SELECT created,order_id FROM retention_scan_cursor WHERE id=1")
      .get();
    const candidates = db
      .prepare(
        "SELECT * FROM orders WHERE content_deleted=1 AND created<=? AND payment_status IN ('paid','refunded') AND (created>? OR (created=? AND id>?)) ORDER BY created,id LIMIT 100",
      )
      .all(
        cutoff.getTime(),
        cursor?.created ?? 0,
        cursor?.created ?? 0,
        cursor?.order_id ?? "",
      );
    const last =
      candidates.length === 100 ? candidates.at(-1)! : { created: 0, id: "" };
    db.prepare(
      "INSERT INTO retention_scan_cursor VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET created=excluded.created,order_id=excluded.order_id",
    ).run(last.created, last.id);
    for (const order of candidates) {
      const id = String(order.id),
        paid = Number(order.paid_at),
        created = Number(order.created);
      if (
        holds.has(id) ||
        !Number.isSafeInteger(created) ||
        created <= 0 ||
        paid < created ||
        !due(paid, 5, now)
      )
        continue;
      const refunds = db
        .prepare("SELECT status,resolved FROM refunds WHERE order_id=?")
        .all(id);
      if (order.payment_status === "paid" && refunds.length) continue;
      if (
        order.payment_status === "refunded" &&
        (refunds.length !== 1 ||
          refunds[0].status !== "completed" ||
          Number(refunds[0].resolved) < paid ||
          !due(Number(refunds[0].resolved), 5, now))
      )
        continue;
      if (
        db
          .prepare(
            "SELECT 1 FROM jobs WHERE order_id=? AND state NOT IN ('done','canceled')",
          )
          .get(id)
      )
        continue;
      if (
        db
          .prepare("SELECT id FROM tickets WHERE order_id=?")
          .all(id)
          .some((t) => !reviewedDeleted.has(String(t.id)))
      )
        continue;
      // Queued mail and provider uncertainty are independent of the order fulfillment state.
      if (
        db
          .prepare("SELECT 1 FROM outbox WHERE email_hash=?")
          .get(order.email_hash)
      )
        continue;
      if (
        hasTable(db, "toss_attempts") &&
        db
          .prepare(
            "SELECT 1 FROM toss_attempts WHERE order_id=? AND (state NOT IN ('verified','refunded') OR needs_check!=0 OR lease_until>?)",
          )
          .get(id, now)
      )
        continue;
      if (
        hasTable(db, "ai_spend_calls") &&
        db
          .prepare(
            "SELECT 1 FROM ai_spend_calls WHERE order_id=? AND state!='completed'",
          )
          .get(id)
      )
        continue;
      orders.push(id);
    }
    const prior = collectDeletions(db),
      next = new Map(prior.map((row) => [deletionIdentity(row), row]));
    for (const id of orders)
      next.set("order:" + id, { orderId: id, deletedAt: now, scope: "full" });
    for (const id of disputes)
      next.set("dispute:" + id, {
        orderId: id,
        deletedAt: now,
        scope: "dispute",
      });
    const rows: Deletions = [...next.values()].sort((a, b) =>
      deletionIdentity(a).localeCompare(deletionIdentity(b)),
    );
    if (!orders.length && !disputes.length) {
      db.exec("COMMIT");
      committed = true;
      return { enabled: true, orders: 0, disputes: 0 };
    }
    // A crash or DB rollback after this durable barrier leaves restoration blocked for review.
    await remote.publish({ sourceId, generatedAt: now, rows, pending: true });
    for (const id of disputes) {
      eraseDispute(db, id);
      db.prepare(
        "INSERT INTO dispute_deletion_tombstones VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)",
      ).run(id, now);
    }
    for (const id of orders) {
      eraseFinancialOrder(db, id);
      db.prepare(
        "INSERT INTO full_deletion_tombstones VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)",
      ).run(id, now);
    }
    db.exec("COMMIT");
    committed = true;
    finishErasure(db);
    await remote.publish({ sourceId, generatedAt: now, rows, pending: false });
    return { enabled: true, orders: orders.length, disputes: disputes.length };
  } catch (error) {
    if (!committed && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
export async function runConfiguredRetentionCycle(db: DatabaseSync) {
  const mode = process.env.RETENTION_ERASURE_MODE;
  if (!mode || mode === "disabled")
    return { enabled: false, orders: 0, disputes: 0 };
  if (
    mode !== "approved" ||
    process.env.RETENTION_ERASURE_APPROVAL !== "retention-erasure-approved"
  )
    throw Error("RETENTION_ACTIVATION_NOT_APPROVED");
  const remote = configuredExternalLedger();
  if (!remote) throw Error("RETENTION_EXTERNAL_LEDGER_REQUIRED");
  const path = resolve(process.env.RETENTION_ERASURE_POLICY ?? "");
  if (
    !process.env.RETENTION_ERASURE_POLICY ||
    realpathSync(path) !== path ||
    path.startsWith(resolve(process.cwd()) + "/")
  )
    throw Error("PRIVATE_RETENTION_POLICY_REQUIRED");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let policy: ErasurePolicy;
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.mode & 0o077 ||
      stat.nlink !== 1 ||
      stat.size > 1024 * 1024 ||
      ![0, process.getuid?.()].includes(stat.uid)
    )
      throw Error("PRIVATE_RETENTION_POLICY_REQUIRED");
    policy = erasurePolicySchema.parse(JSON.parse(readFileSync(fd, "utf8")));
  } finally {
    closeSync(fd);
  }
  // config validation is required before any approved financial record operation.
  config();
  return runRetentionCycle(db, { enabled: true, policy, remote });
}
