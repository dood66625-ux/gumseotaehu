/** Isolated retention store. No worker/production order integration or activation by import. */
import type { DatabaseSync } from "node:sqlite";
export function initRetainedRecords(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS retained_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('transaction','dispute')),payload_enc TEXT NOT NULL,event_at INTEGER NOT NULL,closed_at INTEGER,retain_until INTEGER NOT NULL,legal_hold INTEGER NOT NULL CHECK(legal_hold IN (0,1)),active_work INTEGER NOT NULL CHECK(active_work IN (0,1)),settled INTEGER NOT NULL CHECK(settled IN (0,1)));
 CREATE TABLE IF NOT EXISTS retention_purge_receipts(record_id TEXT PRIMARY KEY,kind TEXT NOT NULL,purged_at INTEGER NOT NULL);`);
}
function anniversary(at: number, years: number) {
  const d = new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.getTime();
}
export function retainRecord(
  db: DatabaseSync,
  record: {
    id: string;
    kind: "transaction" | "dispute";
    payloadEncrypted: string;
    eventAt: number;
    closedAt: number | null;
    legalHold: boolean;
    activeWork: boolean;
    settled: boolean;
  },
) {
  if (
    !record.id ||
    record.id.length > 200 ||
    !record.payloadEncrypted ||
    !Number.isSafeInteger(record.eventAt) ||
    record.eventAt <= 0 ||
    (record.closedAt !== null &&
      (!Number.isSafeInteger(record.closedAt) ||
        record.closedAt < record.eventAt))
  )
    throw Error("INVALID_RETENTION_RECORD");
  if (
    db
      .prepare("SELECT 1 FROM retention_purge_receipts WHERE record_id=?")
      .get(record.id)
  )
    throw Error("PURGED_RECORD_REIMPORT_REQUIRES_REVIEW");
  const prior = db
    .prepare("SELECT kind FROM retained_records WHERE id=?")
    .get(record.id);
  if (prior && prior.kind !== record.kind)
    throw Error("RETENTION_CLASS_CHANGE_REFUSED");
  const until = anniversary(
    Math.max(record.eventAt, record.closedAt ?? 0),
    record.kind === "transaction" ? 5 : 3,
  );
  db.prepare(
    `INSERT INTO retained_records VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_enc=excluded.payload_enc,event_at=MAX(event_at,excluded.event_at),closed_at=NULLIF(MAX(COALESCE(closed_at,0),COALESCE(excluded.closed_at,0)),0),retain_until=MAX(retain_until,excluded.retain_until),legal_hold=MAX(legal_hold,excluded.legal_hold),active_work=excluded.active_work,settled=excluded.settled`,
  ).run(
    record.id,
    record.kind,
    record.payloadEncrypted,
    record.eventAt,
    record.closedAt,
    until,
    Number(record.legalHold),
    Number(record.activeWork),
    Number(record.settled),
  );
}
export function setRetainedRecordHold(
  db: DatabaseSync,
  id: string,
  held: boolean,
) {
  // Trusted offline caller only. A future HTTP adapter must require recent operations MFA/audit.
  const changed = db
    .prepare("UPDATE retained_records SET legal_hold=? WHERE id=?")
    .run(Number(held), id);
  if (changed.changes !== 1) throw Error("RETENTION_RECORD_NOT_FOUND");
}
export function purgeRetainedRecords(
  db: DatabaseSync,
  options: {
    enabled?: boolean;
    restoreProtectionVerified?: boolean;
    now?: number;
  } = {},
) {
  if (!options.enabled) return { enabled: false, purged: 0 };
  if (options.restoreProtectionVerified !== true)
    throw Error("RESTORE_DELETION_PROTECTION_REQUIRED");
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now <= 0)
    throw Error("INVALID_RETENTION_CLOCK");
  if (db.isTransaction) throw Error("RETENTION_TOP_LEVEL_TRANSACTION_REQUIRED");
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db
      .prepare(
        "SELECT id,kind FROM retained_records WHERE retain_until<=? AND event_at<=? AND (closed_at IS NULL OR (closed_at>=event_at AND closed_at<=?)) AND legal_hold=0 AND active_work=0 AND settled=1 AND (kind='transaction' OR closed_at IS NOT NULL) ORDER BY retain_until,id LIMIT 100",
      )
      .all(now, now, now);
    for (const row of rows) {
      db.prepare("INSERT INTO retention_purge_receipts VALUES(?,?,?)").run(
        row.id,
        row.kind,
        now,
      );
      db.prepare("DELETE FROM retained_records WHERE id=?").run(row.id);
    }
    db.exec("COMMIT");
    return { enabled: true, purged: rows.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
