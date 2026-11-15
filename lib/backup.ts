import { applyDeletions, type Deletions } from "./deletion-manifest";
import { backup, DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
const magic = Buffer.from("GSB1");
const maxBytes = 64 * 1024 * 1024;
function checkKey(key: Buffer) {
  if (key.length !== 32) throw Error("BACKUP_KEY_INVALID");
}
function inspect(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      throw Error("BACKUP_DATABASE_INVALID");
  } finally {
    db.close();
  }
}
/** Local archive only. Never writes plaintext snapshots outside a private temporary directory. */
export async function createEncryptedBackup(
  db: DatabaseSync,
  destination: string,
  key: Buffer,
) {
  checkKey(key);
  const dir = dirname(resolve(destination));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(join(dir, ".snapshot-"));
  chmodSync(temp, 0o700);
  try {
    const snapshot = join(temp, "snapshot.sqlite");
    await backup(db, snapshot);
    chmodSync(snapshot, 0o600);
    if (statSync(snapshot).size > maxBytes) throw Error("BACKUP_TOO_LARGE");
    inspect(snapshot);
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(readFileSync(snapshot)),
      cipher.final(),
    ]);
    writeFileSync(
      destination,
      Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]),
      { flag: "wx", mode: 0o600 },
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
/** Restore into a NEW offline file only. Never overwrite an active database or its WAL. */
export function restoreEncryptedBackup(
  source: string,
  destination: string,
  key: Buffer,
  deletions: Deletions = [],
  expectedSourceId?: string,
) {
  checkKey(key);
  const target = resolve(destination);
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    if (existsSync(target + suffix)) throw Error("RESTORE_TARGET_EXISTS");
  if (statSync(source).size > maxBytes + 32) throw Error("BACKUP_TOO_LARGE");
  const archive = readFileSync(source);
  if (archive.length < 33 || !archive.subarray(0, 4).equals(magic))
    throw Error("BACKUP_FORMAT_INVALID");
  let plain: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      archive.subarray(4, 16),
    );
    decipher.setAuthTag(archive.subarray(16, 32));
    plain = Buffer.concat([
      decipher.update(archive.subarray(32)),
      decipher.final(),
    ]);
  } catch {
    throw Error("BACKUP_AUTHENTICATION_FAILED");
  }
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(join(dir, ".restore-"));
  chmodSync(temp, 0o700);
  try {
    const candidate = join(temp, "restored.sqlite");
    writeFileSync(candidate, plain, { flag: "wx", mode: 0o600 });
    const restored = new DatabaseSync(candidate);
    try {
      if (expectedSourceId) {
        const hasSource = restored
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='privacy_checkpoint_source'",
          )
          .get();
        const source = hasSource
          ? restored
              .prepare(
                "SELECT source_id FROM privacy_checkpoint_source WHERE id=1",
              )
              .get()
          : null;
        if (!source || source.source_id !== expectedSourceId)
          throw Error("BACKUP_CHECKPOINT_SOURCE_MISMATCH");
      }
      if (deletions.length) applyDeletions(restored, deletions, key);
      restored.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
      try {
        const has = (table: string) =>
          !!restored
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table);
        if (has("sessions")) restored.exec("DELETE FROM sessions");
        if (has("challenges")) restored.exec("DELETE FROM challenges");
        if (has("email_changes"))
          restored.exec(
            "UPDATE email_changes SET state='canceled' WHERE state='pending'",
          );
        if (has("mail_queue"))
          restored.exec(
            "UPDATE mail_queue SET state=CASE WHEN state IN ('accepted','delivered','bounced','complained') THEN state ELSE 'review' END,recovery_hold=1,needs_check=0,lease_until=0,last_error='RESTORED_REQUIRES_RECONCILIATION'",
          );
        restored.exec("COMMIT;");
      } catch (error) {
        restored.exec("ROLLBACK;");
        throw error;
      }
    } finally {
      restored.close();
    }
    inspect(candidate);
    // Hard-link creation fails if a target appeared during validation.
    linkSync(candidate, target);
  } finally {
    plain.fill(0);
    rmSync(temp, { recursive: true, force: true });
  }
}
