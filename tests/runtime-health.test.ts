import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { workerIsHealthy } from "../scripts/runtime-health";
it("fails closed for absent, stale, future, corrupt or symlinked worker state without creating a DB", () => {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-health-"));
  const path = join(dir, "health.sqlite");
  try {
    expect(workerIsHealthy(path, 100000)).toBe(false);
    expect(existsSync(path)).toBe(false);
    const corrupt = join(dir, "corrupt.sqlite");
    writeFileSync(corrupt, "invalid sqlite data");
    expect(workerIsHealthy(corrupt, 100000)).toBe(false);
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TABLE worker_heartbeat(name TEXT PRIMARY KEY,updated INTEGER NOT NULL)",
    );
    expect(workerIsHealthy(path, 100000)).toBe(false);
    db.prepare("INSERT INTO worker_heartbeat VALUES('reports',?)").run(90000);
    expect(workerIsHealthy(path, 100000)).toBe(true);
    expect(workerIsHealthy(path, 150000)).toBe(false);
    expect(workerIsHealthy(path, 89999)).toBe(false);
    const link = join(dir, "link.sqlite");
    symlinkSync(path, link);
    expect(workerIsHealthy(link, 100000)).toBe(false);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("fails the runtime probe when an existing deletion checkpoint reports failure or expiry", () => {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-privacy-probe-"));
  const file = join(dir, "probe.sqlite");
  const db = new DatabaseSync(file);
  try {
    db.exec(
      "CREATE TABLE worker_heartbeat(name TEXT PRIMARY KEY,updated INTEGER);CREATE TABLE privacy_checkpoint_health(id INTEGER PRIMARY KEY,generated_at INTEGER,last_failure INTEGER);INSERT INTO worker_heartbeat VALUES('reports',2000000);INSERT INTO privacy_checkpoint_health VALUES(1,1999000,NULL)",
    );
    expect(workerIsHealthy(file, 2000000)).toBe(true);
    db.exec("UPDATE privacy_checkpoint_health SET last_failure=2000000");
    expect(workerIsHealthy(file, 2000000)).toBe(false);
    db.exec(
      "UPDATE privacy_checkpoint_health SET last_failure=NULL,generated_at=1000000",
    );
    expect(workerIsHealthy(file, 2000000)).toBe(false);
    db.exec("UPDATE privacy_checkpoint_health SET generated_at=2000001");
    expect(workerIsHealthy(file, 2000000)).toBe(false);
    db.exec("UPDATE privacy_checkpoint_health SET generated_at='corrupt'");
    expect(workerIsHealthy(file, 2000000)).toBe(false);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
