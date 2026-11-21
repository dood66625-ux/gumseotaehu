import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { stageOrderRetention } from "../lib/order-retention-stage";
import { initRetainedRecords } from "../lib/retained-records";
import { decryptJson } from "../lib/crypto";
function setup() {
  const source = new DatabaseSync(":memory:"),
    vault = new DatabaseSync(":memory:");
  initRetainedRecords(vault);
  source.exec(
    "CREATE TABLE orders(id TEXT,amount INTEGER,payment_status TEXT,payment_key TEXT,created INTEGER,paid_at INTEGER,email_enc TEXT,consent_enc TEXT,birth_secret TEXT);CREATE TABLE refunds(order_id TEXT,status TEXT,resolved INTEGER);CREATE TABLE tickets(order_id TEXT,status TEXT);CREATE TABLE jobs(order_id TEXT,state TEXT)",
  );
  source
    .prepare(
      "INSERT INTO orders VALUES('a',22000,'paid','fixture-key',?,?, 'encrypted-email','encrypted-consent','do-not-copy-birth')",
    )
    .run(Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 2));
  return { source, vault };
}
const key = Buffer.alloc(32, 7),
  now = Date.UTC(2026, 0, 1),
  options = {
    enabled: true,
    key,
    now,
    holdsReviewedAt: now,
    heldOrders: new Set<string>(),
  };
it("is disabled by default and stages encrypted minimal records without changing the source", () => {
  const { source, vault } = setup();
  try {
    expect(stageOrderRetention(source, vault).staged).toBe(0);
    expect(stageOrderRetention(source, vault, options).staged).toBe(1);
    const row = vault.prepare("SELECT * FROM retained_records").get()!;
    expect(String(row.payload_enc)).not.toContain("fixture-key");
    const payload = decryptJson<Record<string, unknown>>(
      String(row.payload_enc),
      key,
    );
    expect(payload.orderId).toBe("a");
    expect(payload).not.toHaveProperty("birth_secret");
    expect(JSON.stringify(payload)).not.toContain("do-not-copy-birth");
    expect(
      source.prepare("SELECT birth_secret FROM orders").get()?.birth_secret,
    ).toBe("do-not-copy-birth");
  } finally {
    source.close();
    vault.close();
  }
});
it("carries legal holds, active work and unresolved refunds into the separate store", () => {
  const { source, vault } = setup();
  try {
    source.exec(
      "INSERT INTO refunds VALUES('a','error',NULL);INSERT INTO jobs VALUES('a','running')",
    );
    stageOrderRetention(source, vault, {
      ...options,
      heldOrders: new Set(["a"]),
    });
    expect(
      vault
        .prepare("SELECT legal_hold,active_work,settled FROM retained_records")
        .get(),
    ).toMatchObject({ legal_hold: 1, active_work: 1, settled: 0 });
  } finally {
    source.close();
    vault.close();
  }
});
it("refuses stale review or the same database and rolls back a partial batch", () => {
  const { source, vault } = setup();
  try {
    expect(() => stageOrderRetention(source, source, options)).toThrow();
    expect(() =>
      stageOrderRetention(source, vault, {
        ...options,
        holdsReviewedAt: now - 86400001,
      }),
    ).toThrow();
    source.exec(
      "INSERT INTO orders VALUES('b',22000,'paid','x',1,NULL,'e','c','birth')",
    );
    expect(() => stageOrderRetention(source, vault, options)).toThrow();
    expect(
      vault.prepare("SELECT COUNT(*) n FROM retained_records").get()?.n,
    ).toBe(0);
    expect(source.prepare("SELECT COUNT(*) n FROM orders").get()?.n).toBe(2);
  } finally {
    source.close();
    vault.close();
  }
});
