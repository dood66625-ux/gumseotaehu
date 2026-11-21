import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
it("plans against an existing database without modifying it or exposing order IDs", () => {
  const directory = mkdtempSync(join(tmpdir(), "retention-plan-"));
  try {
    const path = join(directory, "fixture.sqlite"),
      file = join(directory, "policy.json"),
      id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      now = Date.now();
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TABLE orders(id TEXT,created INTEGER,paid_at INTEGER,payment_status TEXT); CREATE TABLE refunds(order_id TEXT,resolved INTEGER,status TEXT); CREATE TABLE tickets(order_id TEXT,status TEXT); CREATE TABLE jobs(order_id TEXT,state TEXT)",
    );
    db.prepare("INSERT INTO orders VALUES(?,?,?,'paid')").run(
      id,
      Date.UTC(2000, 0, 1),
      Date.UTC(2000, 0, 2),
    );
    db.close();
    const before = readFileSync(path);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        purpose: "review-only",
        transactionYears: 5,
        reviewedAt: now,
        holdsReviewed: true,
        heldOrders: [],
      }),
      { mode: 0o600 },
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/retention-plan.ts",
        "--db",
        path,
        "--policy",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      planningOnly: true,
      deletionEnabled: false,
      total: 1,
      counts: { "expired-review-candidate": 1 },
    });
    expect(result.stdout).not.toContain(id);
    expect(readFileSync(path)).toEqual(before);
    const inconsistent = new DatabaseSync(path);
    inconsistent.prepare("INSERT INTO refunds VALUES(?,NULL,'error')").run(id);
    inconsistent.close();
    const guarded = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/retention-plan.ts",
        "--db",
        path,
        "--policy",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(guarded.stdout).counts).toEqual({
      "unresolved-refund": 1,
    });
    const restored = new DatabaseSync(path);
    restored.exec("DELETE FROM refunds");
    restored.close();
    const afterFixtureChange = readFileSync(path);
    chmodSync(file, 0o644);
    const rejected = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/retention-plan.ts",
        "--db",
        path,
        "--policy",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toBe("");
    expect(readFileSync(path)).toEqual(afterFixtureChange);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
