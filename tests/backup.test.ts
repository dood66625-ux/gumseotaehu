import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "geumseo-backup-test-"));
  dirs.push(dir);
  const db = new DatabaseSync(join(dir, "source.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT); CREATE TABLE reports(order_id TEXT REFERENCES orders(id),payload TEXT);",
  );
  db.prepare("INSERT INTO orders VALUES(?,?)").run("synthetic-order", "paid");
  db.prepare("INSERT INTO reports VALUES(?,?)").run(
    "synthetic-order",
    "synthetic-report-same-on-recovery",
  );
  return {
    dir,
    db,
    key: randomBytes(32),
    archive: join(dir, "copy.gsb"),
    target: join(dir, "restored.sqlite"),
  };
}
describe("encrypted consistent local backup and offline restore", () => {
  it("restores WAL data after source closes, retaining paid state and exact report", async () => {
    const f = fixture();
    try {
      await createEncryptedBackup(f.db, f.archive, f.key);
    } finally {
      f.db.close();
    }
    expect(
      readFileSync(f.archive).includes(Buffer.from("synthetic-report")),
    ).toBe(false);
    expect(statSync(f.archive).mode & 0o777).toBe(0o600);
    restoreEncryptedBackup(f.archive, f.target, f.key);
    const recovered = new DatabaseSync(f.target, { readOnly: true });
    try {
      expect(
        recovered
          .prepare(
            "SELECT status,payload FROM orders JOIN reports ON orders.id=reports.order_id",
          )
          .get(),
      ).toEqual({
        status: "paid",
        payload: "synthetic-report-same-on-recovery",
      });
    } finally {
      recovered.close();
    }
    expect(statSync(f.target).mode & 0o777).toBe(0o600);
    expect(
      readdirSync(f.dir).some(
        (n) => n.startsWith(".snapshot-") || n.startsWith(".restore-"),
      ),
    ).toBe(false);
  });
  it("rejects wrong keys and archive tampering without publishing a restored file", async () => {
    const f = fixture();
    try {
      await createEncryptedBackup(f.db, f.archive, f.key);
    } finally {
      f.db.close();
    }
    expect(() =>
      restoreEncryptedBackup(f.archive, f.target, randomBytes(32)),
    ).toThrow("AUTHENTICATION");
    const bytes = readFileSync(f.archive);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(f.archive, bytes);
    expect(() => restoreEncryptedBackup(f.archive, f.target, f.key)).toThrow(
      "AUTHENTICATION",
    );
    expect(readdirSync(f.dir)).not.toContain("restored.sqlite");
  });
  it("never overwrites existing backup, destination or SQLite sidecars", async () => {
    const f = fixture();
    try {
      await createEncryptedBackup(f.db, f.archive, f.key);
      const original = readFileSync(f.archive);
      await expect(
        createEncryptedBackup(f.db, f.archive, f.key),
      ).rejects.toThrow();
      expect(readFileSync(f.archive)).toEqual(original);
      writeFileSync(f.target + "-wal", "synthetic-active-wal");
      expect(() => restoreEncryptedBackup(f.archive, f.target, f.key)).toThrow(
        "TARGET_EXISTS",
      );
      rmSync(f.target + "-wal");
      writeFileSync(f.target, "keep-me");
      expect(() => restoreEncryptedBackup(f.archive, f.target, f.key)).toThrow(
        "TARGET_EXISTS",
      );
      expect(readFileSync(f.target, "utf8")).toBe("keep-me");
    } finally {
      f.db.close();
    }
  });
  it("fails malformed archives and invalid keys safely", () => {
    const f = fixture();
    f.db.close();
    writeFileSync(f.archive, "not-a-backup");
    expect(() => restoreEncryptedBackup(f.archive, f.target, f.key)).toThrow(
      "FORMAT_INVALID",
    );
    expect(() =>
      restoreEncryptedBackup(f.archive, f.target, Buffer.alloc(1)),
    ).toThrow("KEY_INVALID");
  });
  it("rejects foreign key violations in snapshots", async () => {
    const f = fixture();
    try {
      f.db.exec(
        "PRAGMA foreign_keys=OFF; INSERT INTO reports VALUES('missing-order','bad');",
      );
      await expect(
        createEncryptedBackup(f.db, f.archive, f.key),
      ).rejects.toThrow("DATABASE_INVALID");
      expect(readdirSync(f.dir)).not.toContain("copy.gsb");
    } finally {
      f.db.close();
    }
  });
});
