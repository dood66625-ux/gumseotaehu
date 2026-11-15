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
