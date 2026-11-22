/** Validate a supplied archive in a disposable offline database; never open the live DB. */
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreEncryptedBackup } from "./backup";
import { readPrivacyCheckpoint } from "./privacy-checkpoint";
import { withExternalDeletionProof } from "./external-deletion-ledger";
export async function verifyExternalBackup(
  archive: string,
  checkpointFile: string,
  key: Buffer,
) {
  const checkpoint = readPrivacyCheckpoint(checkpointFile, key);
  const directory = mkdtempSync(join(tmpdir(), "gumseo-external-drill-"));
  chmodSync(directory, 0o700);
  try {
    await withExternalDeletionProof(checkpoint.sourceId, checkpoint.rows, () =>
      restoreEncryptedBackup(
        archive,
        join(directory, "offline.sqlite"),
        key,
        checkpoint.rows,
        checkpoint.sourceId,
      ),
    );
    return {
      externalCopyRestore: "passed",
      productionReplaced: false,
      temporaryDatabaseRemoved: true,
      checkpointChecked: true,
    } as const;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
