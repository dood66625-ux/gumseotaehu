import {
  readFileSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config } from "../lib/config";
import { restoreEncryptedBackup } from "../lib/backup";
import { readPrivacyCheckpoint } from "../lib/privacy-checkpoint";
import { decodeDeletions } from "../lib/deletion-manifest";
import { readPrivateKey } from "../lib/private-key-file";
import { rotateDataKey } from "../lib/key-rotation";
async function main() {
  const [source, target, flag, manifest, ...extra] = process.argv.slice(2);
  if (
    !source ||
    !target ||
    !["--deletions", "--checkpoint"].includes(flag) ||
    !manifest ||
    !(
      extra.length === 0 ||
      (extra.length === 2 && extra[0] === "--archive-key-file")
    )
  )
    throw Error(
      "Usage: npm run restore -- <archive.gsb> <NEW offline database> --checkpoint <LATEST signed checkpoint> [--archive-key-file <private old key>] (legacy manual path: --deletions <manifest>)",
    );
  if (statSync(manifest).size > 16 * 1024 * 1024)
    throw Error("DELETIONS_TOO_LARGE");
  const key = config().key;
  const checkpoint =
    flag === "--checkpoint" ? readPrivacyCheckpoint(manifest, key) : undefined;
  const deletions =
    checkpoint?.rows ?? decodeDeletions(readFileSync(manifest, "utf8"), key);
  const archiveKey = extra.length ? readPrivateKey(extra[1]) : key;
  if (archiveKey.equals(key))
    restoreEncryptedBackup(
      source,
      target,
      key,
      deletions,
      checkpoint?.sourceId,
    );
  else {
    const dir = dirname(resolve(target));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = mkdtempSync(join(dir, ".old-key-restore-"));
    try {
      const candidate = join(temp, "candidate.sqlite");
      restoreEncryptedBackup(
        source,
        candidate,
        archiveKey,
        deletions,
        checkpoint?.sourceId,
      );
      await rotateDataKey(candidate, target, archiveKey, key, deletions);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  console.log(
    "New offline database verified under current DATA_KEY with supplied deletion manifest. Restored auth revoked and mail held for reconciliation. Original unchanged. No server started. Checkpoint source/time/signature checked when supplied; authoritative latest/offsite freshness still requires operator verification.",
  );
}
main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message)
      ? error.message
      : "RESTORE_VALIDATION_FAILED";
  console.error(code + " (details suppressed; no server started)");
  process.exitCode = 1;
});
