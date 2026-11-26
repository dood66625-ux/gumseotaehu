/** Shared by approved retention and offline restore; caller owns the transaction. */
import type { DatabaseSync } from "node:sqlite";
const orderChildren = new Set([
  "reports",
  "ai_generation_evidence",
  "jobs",
  "refunds",
  "reading_history",
  "email_changes",
  "report_usage",
  "toss_notifications",
  "toss_attempts",
  "order_generation_lanes",
  "sales_ai_holds",
  "toss_live_orders",
  "pg_ledger",
]);
export function hasTable(db: DatabaseSync, name: string) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
}
function identifier(name: string) {
  return '"' + name.replaceAll('"', '""') + '"';
}
export function eraseDispute(db: DatabaseSync, id: string) {
  if (hasTable(db, "ticket_contacts"))
    db.prepare("DELETE FROM ticket_contacts WHERE ticket_id=?").run(id);
  db.prepare("DELETE FROM tickets WHERE id=?").run(id);
  if (hasTable(db, "retained_records"))
    db.prepare("DELETE FROM retained_records WHERE id=?").run("ticket:" + id);
  for (const table of ["audit", "events"])
    if (hasTable(db, table))
      db.prepare(`DELETE FROM ${table} WHERE target=?`).run(id);
}
export function eraseFinancialOrder(db: DatabaseSync, id: string) {
  if (!db.isTransaction) throw Error("ERASURE_TRANSACTION_REQUIRED");
  const readings = db
    .prepare(
      "SELECT reading_id FROM orders WHERE id=? UNION SELECT reading_id FROM reading_history WHERE order_id=?",
    )
    .all(id, id);
  // Schema extensions must declare their erasure policy; never disable foreign keys to force deletion.
  for (const table of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()) {
    const name = String(table.name);
    const dependencies = db
      .prepare(`PRAGMA foreign_key_list(${identifier(name)})`)
      .all();
    if (
      dependencies.some((d) => d.table === "orders") &&
      !orderChildren.has(name)
    )
      throw Error("ERASURE_SCHEMA_REVIEW_REQUIRED");
  }
  for (const ticket of db
    .prepare("SELECT id FROM tickets WHERE order_id=?")
    .all(id))
    eraseDispute(db, String(ticket.id));
  for (const table of orderChildren)
    if (hasTable(db, table))
      db.prepare(`DELETE FROM ${table} WHERE order_id=?`).run(id);
  for (const table of ["audit", "events"])
    if (hasTable(db, table))
      db.prepare(`DELETE FROM ${table} WHERE target=?`).run(id);
  if (hasTable(db, "retained_records"))
    db.prepare("DELETE FROM retained_records WHERE id=?").run("order:" + id);
  db.prepare("DELETE FROM orders WHERE id=?").run(id);
  for (const row of readings)
    db.prepare(
      "DELETE FROM readings WHERE id=? AND NOT EXISTS(SELECT 1 FROM orders WHERE reading_id=?) AND NOT EXISTS(SELECT 1 FROM reading_history WHERE reading_id=?)",
    ).run(row.reading_id, row.reading_id, row.reading_id);
}
/** Best effort is insufficient for a completed erasure: busy WAL readers require a retry. */
export function finishErasure(db: DatabaseSync) {
  if (db.isTransaction) throw Error("ERASURE_COMMIT_REQUIRED");
  const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  if (Number(result?.busy) !== 0)
    throw Error("ERASURE_WAL_CHECKPOINT_REQUIRED");
}
