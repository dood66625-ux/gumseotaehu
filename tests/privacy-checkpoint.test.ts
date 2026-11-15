import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  publishPrivacyCheckpoint,
  readPrivacyCheckpoint,
  privacyCheckpointDirectory,
} from "../lib/privacy-checkpoint";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-checkpoint-"));
  dirs.push(dir);
  const db = new DatabaseSync(join(dir, "source.sqlite"));
  db.exec(
    "CREATE TABLE deletion_tombstones(order_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL);CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT);",
  );
  return {
    dir,
    db,
    key: randomBytes(32),
    folder: join(dir, "checkpoints"),
    now: 1000000,
  };
}
it("publishes a private signed checkpoint; reuses unchanged manifests and refreshes the receipt", () => {
  const f = fixture();
  try {
    const first = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    expect(statSync(first.path).mode & 0o777).toBe(0o600);
    const before = readPrivacyCheckpoint(first.path, f.key, f.now);
    expect(before.rows).toEqual([]);
    expect(
      publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 1000).changed,
    ).toBe(false);
    publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 300001);
    expect(
      readPrivacyCheckpoint(first.path, f.key, f.now + 300001).manifestFile,
    ).toBe(before.manifestFile);
    expect(readdirSync(f.folder).length).toBe(2);
    f.db
      .prepare("UPDATE privacy_checkpoint_source SET source_id=?")
      .run("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(() =>
      publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 300002),
    ).toThrow("SOURCE_MISMATCH");
    expect(
      readPrivacyCheckpoint(first.path, f.key, f.now + 300002).sourceId,
    ).toBe(before.sourceId);
  } finally {
    f.db.close();
  }
});
it("exports new deletions even within the refresh interval and rejects rollback to an older receipt age", () => {
  const f = fixture();
  try {
    const first = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    const old = readFileSync(first.path);
    f.db
      .prepare("INSERT INTO deletion_tombstones VALUES(?,?)")
      .run("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", f.now + 1);
    publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 2);
    expect(
      readPrivacyCheckpoint(first.path, f.key, f.now + 2).rows,
    ).toHaveLength(1);
    writeFileSync(first.path, old);
    expect(() =>
      readPrivacyCheckpoint(first.path, f.key, f.now + 25 * 3600000),
    ).toThrow("STALE");
  } finally {
    f.db.close();
  }
});
it("rejects forged receipts, wrong keys, future time and modified manifests", () => {
  const f = fixture();
  try {
    const r = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    const row = readPrivacyCheckpoint(r.path, f.key, f.now);
    expect(() => readPrivacyCheckpoint(r.path, randomBytes(32), f.now)).toThrow(
      "AUTHENTICATION",
    );
    expect(() => readPrivacyCheckpoint(r.path, f.key, f.now - 30001)).toThrow(
      "FUTURE",
    );
    const original = readFileSync(r.path);
    const forged = JSON.parse(original.toString());
    forged.count = 1;
    writeFileSync(r.path, JSON.stringify(forged));
    expect(() => readPrivacyCheckpoint(r.path, f.key, f.now)).toThrow(
      "AUTHENTICATION",
    );
    writeFileSync(r.path, original);
    writeFileSync(join(f.folder, row.manifestFile), "modified");
    expect(() => readPrivacyCheckpoint(r.path, f.key, f.now)).toThrow(
      "MANIFEST_MISMATCH",
    );
  } finally {
    f.db.close();
  }
});
it("rejects directory/file symlinks and does not overwrite an invalid latest checkpoint", () => {
  const f = fixture();
  try {
    const r = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    const alias = join(f.dir, "alias");
    symlinkSync(f.folder, alias);
    expect(() =>
      readPrivacyCheckpoint(join(alias, "latest.json"), f.key, f.now),
    ).toThrow("DIRECTORY");
    const manifest = readPrivacyCheckpoint(r.path, f.key, f.now).manifestFile;
    rmSync(join(f.folder, manifest));
    symlinkSync(r.path, join(f.folder, manifest));
    expect(() => readPrivacyCheckpoint(r.path, f.key, f.now)).toThrow("FILE");
    expect(() =>
      publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 1),
    ).toThrow();
    expect(readdirSync(f.folder).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  } finally {
    f.db.close();
  }
});
it("binds a backup to its source DB and refuses a mismatched checkpoint before publishing a restore", async () => {
  const f = fixture();
  try {
    const r = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    const row = readPrivacyCheckpoint(r.path, f.key, f.now);
    const archive = join(f.dir, "before.gsb");
    await createEncryptedBackup(f.db, archive, f.key);
    const out = join(f.dir, "restored.sqlite");
    expect(() =>
      restoreEncryptedBackup(
        archive,
        out,
        f.key,
        [],
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    ).toThrow("SOURCE_MISMATCH");
    expect(existsSync(out)).toBe(false);
    restoreEncryptedBackup(archive, out, f.key, row.rows, row.sourceId);
    expect(existsSync(out)).toBe(true);
  } finally {
    f.db.close();
  }
});
it("separates checkpoint directories after data-key rotation without reusing an old signature", () => {
  expect(
    privacyCheckpointDirectory("/data/other.sqlite", Buffer.alloc(32, 1)),
  ).not.toBe(
    privacyCheckpointDirectory("/data/db.sqlite", Buffer.alloc(32, 1)),
  );
  expect(
    privacyCheckpointDirectory("/data/db.sqlite", Buffer.alloc(32, 1)),
  ).not.toBe(
    privacyCheckpointDirectory("/data/db.sqlite", Buffer.alloc(32, 2)),
  );
});

it("replays a deletion newer than the archive while preserving the paid transaction", async () => {
  const f = fixture();
  try {
    const { encryptJson, decryptJson } = await import("../lib/crypto");
    f.db.exec(
      "ALTER TABLE orders ADD COLUMN reading_id TEXT;ALTER TABLE orders ADD COLUMN content_deleted INTEGER DEFAULT 0;CREATE TABLE readings(id TEXT PRIMARY KEY,input_enc TEXT,chart_enc TEXT,preview_enc TEXT);CREATE TABLE reading_history(order_id TEXT,reading_id TEXT);CREATE TABLE reports(order_id TEXT,payload TEXT);CREATE TABLE jobs(order_id TEXT,state TEXT);",
    );
    const oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    f.db
      .prepare("INSERT INTO orders VALUES(?,'paid','fixture-reading',0)")
      .run(oid);
    const sealed = encryptJson({ synthetic: "birth-data" }, f.key);
    f.db
      .prepare("INSERT INTO readings VALUES(?,?,?,?)")
      .run("fixture-reading", sealed, sealed, sealed);
    f.db
      .prepare("INSERT INTO reading_history VALUES(?,'fixture-reading')")
      .run(oid);
    f.db.prepare("INSERT INTO reports VALUES(?,?)").run(oid, sealed);
    f.db.prepare("INSERT INTO jobs VALUES(?,'done')").run(oid);
    const receipt = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    const archive = join(f.dir, "older.gsb");
    await createEncryptedBackup(f.db, archive, f.key);
    f.db
      .prepare("INSERT INTO deletion_tombstones VALUES(?,?)")
      .run(oid, f.now + 1);
    publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 2);
    const latest = readPrivacyCheckpoint(receipt.path, f.key, f.now + 2);
    const target = join(f.dir, "recovered.sqlite");
    restoreEncryptedBackup(
      archive,
      target,
      f.key,
      latest.rows,
      latest.sourceId,
    );
    const restored = new DatabaseSync(target, { readOnly: true });
    try {
      expect(
        restored.prepare("SELECT status,content_deleted FROM orders").get(),
      ).toEqual({ status: "paid", content_deleted: 1 });
      expect(restored.prepare("SELECT COUNT(*) n FROM reports").get()!.n).toBe(
        0,
      );
      expect(
        decryptJson(
          String(
            restored.prepare("SELECT input_enc FROM readings").get()!.input_enc,
          ),
          f.key,
        ),
      ).toBeNull();
      expect(restored.prepare("SELECT state FROM jobs").get()!.state).toBe(
        "canceled",
      );
    } finally {
      restored.close();
    }
  } finally {
    f.db.close();
  }
});
it("surfaces missing, failed, stale and recovered checkpoint health without personal data", async () => {
  const f = fixture();
  try {
    const { privacyCheckpointHealth, recordPrivacyCheckpointFailure } =
      await import("../lib/privacy-checkpoint");
    expect(privacyCheckpointHealth(f.db, f.now).healthy).toBe(false);
    const r = publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now);
    expect(privacyCheckpointHealth(f.db, f.now).healthy).toBe(true);
    recordPrivacyCheckpointFailure(f.db, f.now + 1);
    expect(privacyCheckpointHealth(f.db, f.now + 1).failed).toBe(true);
    publishPrivacyCheckpoint(f.db, f.folder, f.key, f.now + 2);
    expect(privacyCheckpointHealth(f.db, f.now + 2).healthy).toBe(true);
    expect(privacyCheckpointHealth(f.db, f.now + 600001).healthy).toBe(false);
    expect(readPrivacyCheckpoint(r.path, f.key, f.now + 2).count).toBe(0);
  } finally {
    f.db.close();
  }
});

it("restores through the CLI with a fresh checkpoint and rejects stale input without leaking keys", async () => {
  const f = fixture();
  try {
    const { spawnSync } = await import("node:child_process");
    const first = publishPrivacyCheckpoint(f.db, f.folder, f.key, Date.now());
    const archive = join(f.dir, "cli.gsb");
    await createEncryptedBackup(f.db, archive, f.key);
    const env = {
      ...process.env,
      APP_MODE: "local",
      EXTERNAL_EFFECTS: "disabled",
      DATA_KEY: f.key.toString("hex"),
      AUTH_SECRET: "synthetic-auth-".repeat(4),
      ADMIN_PASSWORD: "synthetic-admin-".repeat(4),
      ADMIN_TOTP_SECRET: "ab".repeat(20),
      DATABASE_PATH: join(f.dir, "unused.sqlite"),
      OPENAI_API_KEY: "",
      TOSS_TEST_SECRET_KEY: "",
      TOSS_TEST_CLIENT_KEY: "",
    };
    const target = join(f.dir, "cli-restored.sqlite");
    const run = (destination: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/restore.ts",
          archive,
          destination,
          "--checkpoint",
          first.path,
        ],
        { cwd: process.cwd(), env, encoding: "utf8", timeout: 15000 },
      );
    const ok = run(target);
    expect(ok.status).toBe(0);
    expect(existsSync(target)).toBe(true);
    expect(ok.stdout + ok.stderr).not.toContain(f.key.toString("hex"));
    const now = Date.now();
    const staleFolder = join(f.dir, "stale");
    const stale = publishPrivacyCheckpoint(
      f.db,
      staleFolder,
      f.key,
      now - 25 * 3600000,
    );
    const denied = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/restore.ts",
        archive,
        join(f.dir, "denied.sqlite"),
        "--checkpoint",
        stale.path,
      ],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 15000 },
    );
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).toContain("STALE_OR_FUTURE");
    expect(existsSync(join(f.dir, "denied.sqlite"))).toBe(false);
    expect(denied.stdout + denied.stderr).not.toContain(f.key.toString("hex"));
  } finally {
    f.db.close();
  }
});
