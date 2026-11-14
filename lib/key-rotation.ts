import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createEncryptedBackup, restoreEncryptedBackup } from "./backup";
import { decryptJson, encryptJson } from "./crypto";
import type { Deletions } from "./deletion-manifest";
const fields: Record<string, string[]> = {
  readings: ["input_enc", "chart_enc", "preview_enc"],
  orders: ["email_enc", "consent_enc"],
  challenges: ["email_enc"],
  reports: ["payload"],
  outbox: ["payload"],
  tickets: ["payload"],
  refunds: ["reason_enc"],
  email_changes: ["new_email_enc"],
};
/** New offline copy only. AUTH_SECRET/HMAC identities and live files are never changed. */
export async function rotateDataKey(
  source: string,
  target: string,
  oldKey: Buffer,
  newKey: Buffer,
  deletions: Deletions,
) {
  if (oldKey.length !== 32 || newKey.length !== 32 || oldKey.equals(newKey))
    throw Error("ROTATION_KEYS_INVALID");
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    if (existsSync(target + suffix)) throw Error("ROTATION_TARGET_EXISTS");
  const dir = dirname(resolve(target));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(join(dir, ".key-rotation-"));
  try {
    const input = new DatabaseSync(source, { readOnly: true });
    try {
      await createEncryptedBackup(input, join(temp, "before.gsb"), oldKey);
    } finally {
      input.close();
    }
    const candidate = join(temp, "candidate.sqlite");
    restoreEncryptedBackup(
      join(temp, "before.gsb"),
      candidate,
      oldKey,
      deletions,
    );
    const db = new DatabaseSync(candidate);
    let encryptedFields = 0;
    try {
      db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
      try {
        for (const [table, columns] of Object.entries(fields)) {
          if (
            !db
              .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
              )
              .get(table)
          )
            continue;
          const rows = db
            .prepare(
              `SELECT rowid AS record_id,${columns.join(",")} FROM ${table}`,
            )
            .all();
          for (const row of rows) {
            const values = columns.map((column) => {
              encryptedFields++;
              return encryptJson(
                decryptJson(row[column] as string, oldKey),
                newKey,
              );
            });
            db.prepare(
              `UPDATE ${table} SET ${columns.map((c) => c + "=?").join(",")} WHERE rowid=?`,
            ).run(...values, row.record_id as number);
          }
        }
        db.exec("DELETE FROM sessions; DELETE FROM challenges;");
        if (
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name='email_changes'",
            )
            .get()
        )
          db.exec(
            "UPDATE email_changes SET state='canceled' WHERE state='pending';",
          );
        db.exec("COMMIT;");
      } catch {
        db.exec("ROLLBACK;");
        throw Error("KEY_ROTATION_VALIDATION_FAILED");
      }
      await createEncryptedBackup(db, join(temp, "after.gsb"), newKey);
    } finally {
      db.close();
    }
    restoreEncryptedBackup(join(temp, "after.gsb"), target, newKey);
    return { encryptedFields };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
