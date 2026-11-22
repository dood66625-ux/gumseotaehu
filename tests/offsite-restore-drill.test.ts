import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createEncryptedBackup } from "../lib/backup";
import { publishPrivacyCheckpoint } from "../lib/privacy-checkpoint";
import { verifyExternalBackup } from "../lib/offsite-restore-drill";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function fixture() {
  vi.stubEnv("PRIVACY_EXTERNAL_LEDGER_MODE", "disabled");
  const dir = mkdtempSync(join(tmpdir(), "gumseo-offsite-test-"));
  dirs.push(dir);
  const source = join(dir, "source.sqlite"),
    db = new DatabaseSync(source),
    key = randomBytes(32);
  db.exec(
    "CREATE TABLE deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL);CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT)",
  );
  const checkpoint = publishPrivacyCheckpoint(
      db,
      join(dir, "checkpoint"),
      key,
    ).path,
    archive = join(dir, "archive.gsb");
  await createEncryptedBackup(db, archive, key);
  db.close();
  return { source, archive, key, checkpoint };
}
it("restores a supplied archive offline, cleans temporary files and leaves input/live files unchanged", async () => {
  const f = await fixture(),
    before = readFileSync(f.source),
    archive = readFileSync(f.archive);
  const temporary = () =>
    readdirSync(tmpdir())
      .filter((name) => name.startsWith("gumseo-external-drill-"))
      .sort();
  const initial = temporary();
  expect(
    await verifyExternalBackup(f.archive, f.checkpoint, f.key),
  ).toMatchObject({
    externalCopyRestore: "passed",
    productionReplaced: false,
    temporaryDatabaseRemoved: true,
  });
  expect(readFileSync(f.source)).toEqual(before);
  expect(readFileSync(f.archive)).toEqual(archive);
  expect(temporary()).toEqual(initial);
});
it("rejects damaged input or a checkpoint from a different database", async () => {
  const f = await fixture(),
    other = await fixture();
  await expect(
    verifyExternalBackup(f.archive, other.checkpoint, other.key),
  ).rejects.toThrow();
  await expect(
    verifyExternalBackup(f.archive, other.checkpoint, f.key),
  ).rejects.toThrow();
  const before = readFileSync(f.source),
    data = readFileSync(f.archive);
  data[40] ^= 1;
  writeFileSync(f.archive, data);
  await expect(
    verifyExternalBackup(f.archive, f.checkpoint, f.key),
  ).rejects.toThrow("BACKUP_AUTHENTICATION_FAILED");
  expect(readFileSync(f.source)).toEqual(before);
});
