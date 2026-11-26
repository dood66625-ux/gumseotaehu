import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { eraseFinancialOrder, eraseDispute } from "./financial-erasure";
import { encryptJson } from "./crypto";
const entries = z
  .array(
    z.object({
      orderId: z.string().uuid(),
      deletedAt: z.number().int().nonnegative(),
      scope: z.enum(["full", "dispute"]).optional(),
    }),
  )
  .max(100000);
export type Deletions = z.infer<typeof entries>;
function mac(payload: string, key: Buffer) {
  return createHmac("sha256", key)
    .update("geumseo-deletions-v1:" + payload)
    .digest("hex");
}
export function encodeDeletions(rows: Deletions, key: Buffer) {
  const payload = Buffer.from(JSON.stringify(entries.parse(rows))).toString(
    "base64",
  );
  return JSON.stringify({ version: 1, payload, signature: mac(payload, key) });
}
export function decodeDeletions(text: string, key: Buffer): Deletions {
  if (Buffer.byteLength(text) > 16 * 1024 * 1024)
    throw Error("DELETIONS_TOO_LARGE");
  const envelope = z
    .object({
      version: z.literal(1),
      payload: z.string(),
      signature: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(JSON.parse(text));
  if (
    !timingSafeEqual(
      Buffer.from(envelope.signature, "hex"),
      Buffer.from(mac(envelope.payload, key), "hex"),
    )
  )
    throw Error("DELETIONS_AUTHENTICATION_FAILED");
  return entries.parse(
    JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8")),
  );
}
/** Reapply the latest authoritative deletion list before a restored file becomes available. */
export function applyDeletions(db: DatabaseSync, rows: Deletions, key: Buffer) {
  if (!rows.length) return;
  entries.parse(rows);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; BEGIN IMMEDIATE;");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL)",
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS full_deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS dispute_deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL)",
    );
    for (const row of rows) {
      if (row.scope) {
        if (row.scope === "full") eraseFinancialOrder(db, row.orderId);
        else eraseDispute(db, row.orderId);
        const table =
          row.scope === "full"
            ? "full_deletion_tombstones"
            : "dispute_deletion_tombstones";
        db.prepare(
          `INSERT INTO ${table} VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)`,
        ).run(row.orderId, row.deletedAt);
        continue;
      }
      const order = db
        .prepare("SELECT reading_id FROM orders WHERE id=?")
        .get(row.orderId);
      if (order) {
        db.prepare("DELETE FROM reports WHERE order_id=?").run(row.orderId);
        if (
          db
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE name='ai_generation_evidence'",
            )
            .get()
        )
          db.prepare("DELETE FROM ai_generation_evidence WHERE order_id=?").run(
            row.orderId,
          );
        const readings = db
          .prepare(
            "SELECT reading_id FROM reading_history WHERE order_id=? UNION SELECT reading_id FROM orders WHERE id=?",
          )
          .all(row.orderId, row.orderId);
        for (const reading of readings)
          db.prepare(
            "UPDATE readings SET input_enc=?,chart_enc=?,preview_enc=? WHERE id=?",
          ).run(
            encryptJson(null, key),
            encryptJson(null, key),
            encryptJson(null, key),
            reading.reading_id as string,
          );
        db.prepare("UPDATE jobs SET state='canceled' WHERE order_id=?").run(
          row.orderId,
        );
        db.prepare("UPDATE orders SET content_deleted=1 WHERE id=?").run(
          row.orderId,
        );
      }
      db.prepare(
        "INSERT INTO deletion_tombstones VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET deleted_at=MIN(deleted_at,excluded.deleted_at)",
      ).run(row.orderId, row.deletedAt);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function deletionIdentity(row: Deletions[number]) {
  return (row.scope === "dispute" ? "dispute:" : "order:") + row.orderId;
}
export function collectDeletions(db: DatabaseSync): Deletions {
  db.exec(
    "CREATE TABLE IF NOT EXISTS deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS full_deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS dispute_deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL)",
  );
  const legacy = db
    .prepare(
      "SELECT order_id AS orderId,deleted_at AS deletedAt FROM deletion_tombstones WHERE order_id NOT IN(SELECT order_id FROM full_deletion_tombstones)",
    )
    .all() as Deletions;
  const full = db
    .prepare(
      "SELECT order_id AS orderId,deleted_at AS deletedAt,'full' AS scope FROM full_deletion_tombstones",
    )
    .all() as Deletions;
  const disputes = db
    .prepare(
      "SELECT order_id AS orderId,deleted_at AS deletedAt,'dispute' AS scope FROM dispute_deletion_tombstones",
    )
    .all() as Deletions;
  return [...legacy, ...full, ...disputes].sort((a, b) =>
    deletionIdentity(a).localeCompare(deletionIdentity(b)),
  );
}
