import { finishErasure } from "../lib/financial-erasure";
import {
  configuredExternalLedger,
  withExternalDeletionProof,
} from "../lib/external-deletion-ledger";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { db } from "../lib/db";
import { config } from "../lib/config";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
import {
  publishPrivacyCheckpoint,
  privacyCheckpointDirectory,
  readPrivacyCheckpoint,
} from "../lib/privacy-checkpoint";

// Local encrypted archive and offline restore drill. No provider calls or live restore.
try {
  const c = config();
  const directory = join(dirname(c.db), "backups");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const checkpoint = publishPrivacyCheckpoint(
    db(),
    privacyCheckpointDirectory(c.db, c.key),
    c.key,
  );
  const archive = join(directory, `gumseo-${Date.now()}-${randomUUID()}.gsb`);
  await createEncryptedBackup(db(), archive, c.key);
  const latest = readPrivacyCheckpoint(checkpoint.path, c.key);
  const remote = configuredExternalLedger();
  if (remote) {
    finishErasure(db());
    await remote.publish({
      sourceId: latest.sourceId,
      generatedAt: latest.generatedAt,
      rows: latest.rows,
      pending: false,
    });
  }
  const temporary = mkdtempSync(join(directory, ".drill-"));
  try {
    await withExternalDeletionProof(latest.sourceId, latest.rows, () =>
      restoreEncryptedBackup(
        archive,
        join(temporary, "offline.sqlite"),
        c.key,
        latest.rows,
        latest.sourceId,
      ),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      archive,
      checkpoint: checkpoint.path,
      offlineRestore: "passed",
      offsite: false,
    }),
  );
} catch {
  console.error(
    "BACKUP_OR_OFFLINE_RESTORE_FAILED; live database not replaced; details suppressed",
  );
  process.exitCode = 1;
}
