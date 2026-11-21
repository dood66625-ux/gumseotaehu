import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runRetentionCycle,
  runConfiguredRetentionCycle,
  type ErasurePolicy,
} from "../lib/retention-runtime";
import {
  ExternalDeletionLedger,
  withExternalDeletionProof,
} from "../lib/external-deletion-ledger";
import {
  collectDeletions,
  encodeDeletions,
  decodeDeletions,
} from "../lib/deletion-manifest";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
import { rotateDataKey } from "../lib/key-rotation";
import { encryptJson } from "../lib/crypto";
const key = Buffer.from("11".repeat(32), "hex"),
  now = Date.now(),
  old = Date.UTC(2019, 0, 1);
const opened: DatabaseSync[] = [],
  directories: string[] = [];
function fixture() {
  const db = new DatabaseSync(":memory:");
  opened.push(db);
  db.exec(readFileSync("db/001-init.sql", "utf8"));
  const sourceId = randomUUID(),
    id = randomUUID(),
    reading = randomUUID();
  db.prepare("INSERT INTO privacy_checkpoint_source VALUES(1,?)").run(sourceId);
  db.prepare(
    "INSERT INTO readings VALUES(?, 'fixture-session','19+',?,?,?,?)",
  ).run(
    reading,
    encryptJson(null, key),
    encryptJson(null, key),
    encryptJson(null, key),
    old,
  );
  db.prepare(
    "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,payment_key,created,paid_at,content_deleted,consent_enc) VALUES(?,?,'fixture-hash',?,22000,'paid','ready','fixture-payment',?,?,1,?)",
  ).run(
    id,
    reading,
    encryptJson("fixture@example.invalid", key),
    old,
    old + 1000,
    encryptJson({}, key),
  );
  db.prepare(
    "INSERT INTO pg_ledger VALUES('fixture-payment',?,22000,'paid',NULL)",
  ).run(id);
  const policy: ErasurePolicy = {
    version: 1,
    purpose: "approved-retention-erasure",
    sourceId,
    reviewedAt: now,
    holdsReviewed: true,
    transactionYears: 5,
    disputeYears: 3,
    heldOrders: [],
    heldDisputes: [],
    closedDisputes: [],
  };
  const remote = { publish: vi.fn(async (_state: any) => {}) };
  return { db, id, reading, sourceId, policy, remote };
}
function options(f: ReturnType<typeof fixture>) {
  return { enabled: true, policy: f.policy, remote: f.remote, now };
}
function ticket(f: ReturnType<typeof fixture>, status = "closed") {
  const id = randomUUID();
  f.db
    .prepare(
      "INSERT INTO tickets VALUES(?,'fixture-hash',?,'support','encrypted-fixture',?,?,?)",
    )
    .run(id, f.id, status, old, old + 1000);
  f.db
    .prepare("INSERT INTO ticket_contacts VALUES(?,'encrypted-contact')")
    .run(id);
  return id;
}
beforeEach(() => {
  vi.stubEnv("PRIVACY_EXTERNAL_LEDGER_MODE", "disabled");
  vi.stubEnv("RETENTION_ERASURE_MODE", "disabled");
});
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("does nothing by default and refuses missing external protection, stale holds or another source", async () => {
  const f = fixture();
  expect(await runConfiguredRetentionCycle(f.db)).toMatchObject({
    enabled: false,
  });
  expect(await runRetentionCycle(f.db)).toMatchObject({ enabled: false });
  await expect(
    runRetentionCycle(f.db, { ...options(f), remote: undefined }),
  ).rejects.toThrow();
  await expect(
    runRetentionCycle(f.db, {
      ...options(f),
      policy: { ...f.policy, reviewedAt: now - 86400001 },
    }),
  ).rejects.toThrow();
  await expect(
    runRetentionCycle(f.db, {
      ...options(f),
      policy: { ...f.policy, sourceId: randomUUID() },
    }),
  ).rejects.toThrow();
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  expect(f.remote.publish).not.toHaveBeenCalled();
});
it("uses a durable pending barrier then erases financial children and records scoped deletion receipts", async () => {
  const f = fixture(),
    tid = ticket(f);
  f.policy.closedDisputes = [{ id: tid, closedAt: old + 2000 }];
  f.remote.publish.mockImplementation(async (state: any) => {
    expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(
      state.pending ? 1 : 0,
    );
  });
  expect(await runRetentionCycle(f.db, options(f))).toMatchObject({
    orders: 1,
    disputes: 1,
  });
  for (const table of [
    "orders",
    "readings",
    "tickets",
    "ticket_contacts",
    "pg_ledger",
  ])
    expect(f.db.prepare(`SELECT count(*) n FROM ${table}`).get()?.n).toBe(0);
  expect(f.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  const rows = collectDeletions(f.db);
  expect(rows).toHaveLength(2);
  expect(decodeDeletions(encodeDeletions(rows, key), key)).toEqual(rows);
  expect(f.remote.publish.mock.calls.map(([s]) => s.pending)).toEqual([
    true,
    false,
  ]);
});
it.each([
  "hold",
  "ticket",
  "work",
  "refund",
  "mail",
  "recent",
  "provider",
  "unexpired-dispute",
])("keeps protected records: %s", async (reason) => {
  const f = fixture();
  if (reason === "hold") f.policy.heldOrders = [f.id];
  if (reason === "ticket") ticket(f, "open");
  if (reason === "work")
    f.db
      .prepare("INSERT INTO jobs VALUES(?,?,1,'running',0,?,NULL,NULL)")
      .run(randomUUID(), f.id, now);
  if (reason === "refund")
    f.db
      .prepare(
        "INSERT INTO refunds VALUES(?,?,22000,'encrypted','error',NULL,?,NULL)",
      )
      .run(randomUUID(), f.id, old);
  if (reason === "mail")
    f.db
      .prepare(
        "INSERT INTO outbox VALUES(?,'fixture-hash','encrypted',?,'local_only')",
      )
      .run(randomUUID(), now);
  if (reason === "recent") f.db.prepare("UPDATE orders SET paid_at=?").run(now);
  if (reason === "provider")
    f.db
      .prepare(
        "INSERT INTO toss_attempts(order_id,payment_key,merchant_id,state,refund_reason_enc,created,updated) VALUES(?,'fixture-payment','fixture-mid','uncertain','encrypted',?,?)",
      )
      .run(f.id, old, old);
  if (reason === "unexpired-dispute") {
    const id = ticket(f);
    f.policy.closedDisputes = [{ id, closedAt: now - 1000 }];
  }
  expect(await runRetentionCycle(f.db, options(f))).toMatchObject({
    orders: 0,
    disputes: 0,
  });
  expect(f.remote.publish).not.toHaveBeenCalled();
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
});
it("retires a closed dispute after three years while retaining a recent transaction", async () => {
  const f = fixture(),
    id = ticket(f);
  f.policy.closedDisputes = [{ id, closedAt: old + 3000 }];
  f.db.prepare("UPDATE orders SET paid_at=?").run(now);
  expect(await runRetentionCycle(f.db, options(f))).toMatchObject({
    orders: 0,
    disputes: 1,
  });
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  expect(collectDeletions(f.db)[0].scope).toBe("dispute");
});
it("does not erase without external acknowledgement, or on an unknown dependency, and leaves a pending barrier after SQL failure", async () => {
  const f = fixture();
  f.remote.publish.mockRejectedValueOnce(Error("fixture outage"));
  await expect(runRetentionCycle(f.db, options(f))).rejects.toThrow();
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  f.db.exec("CREATE TABLE extension(order_id TEXT REFERENCES orders(id))");
  await expect(runRetentionCycle(f.db, options(f))).rejects.toThrow(
    "ERASURE_SCHEMA_REVIEW_REQUIRED",
  );
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  expect(f.remote.publish.mock.calls.at(-1)![0].pending).toBe(true);
  expect(collectDeletions(f.db)).toEqual([]);
});
it("keeps a failed finalization pending, then prevents resurrection from a pre-erasure encrypted backup including key rotation", async () => {
  const f = fixture(),
    tid = ticket(f);
  f.policy.closedDisputes = [{ id: tid, closedAt: old + 2000 }];
  const dir = mkdtempSync(join(tmpdir(), "gumseo-retention-"));
  directories.push(dir);
  const archive = join(dir, "old.gsb");
  await createEncryptedBackup(f.db, archive, key);
  let body: string | undefined,
    version = 0,
    failFinal = true;
  const send = vi.fn(async (_url: any, init: any) => {
    if (init.method === "GET")
      return body
        ? new Response(body, { headers: { etag: '"v' + version + '"' } })
        : new Response(null, { status: 404 });
    if (
      (body && init.headers["If-Match"] !== '"v' + version + '"') ||
      (!body && init.headers["If-None-Match"] !== "*")
    )
      return new Response(null, { status: 412 });
    if (version === 1 && failFinal) return new Response(null, { status: 503 });
    body = init.body;
    version++;
    return new Response(null, { status: 200 });
  });
  const remote = new ExternalDeletionLedger(
    "https://ledger.example.invalid/state",
    "a".repeat(40),
    key,
    send as typeof fetch,
  );
  await expect(
    runRetentionCycle(f.db, { ...options(f), remote }),
  ).rejects.toThrow();
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(0);
  const rows = collectDeletions(f.db);
  await expect(remote.verify(f.sourceId, rows)).rejects.toThrow(
    "EXTERNAL_LEDGER_RESTORE_BLOCKED",
  );
  failFinal = false;
  await remote.publish({
    sourceId: f.sourceId,
    generatedAt: now,
    rows,
    pending: false,
  });
  for (const [k, v] of Object.entries({
    PRIVACY_EXTERNAL_LEDGER_MODE: "conditional-https",
    PRIVACY_EXTERNAL_LEDGER_APPROVAL: "encrypted-deletion-ledger-approved",
    PRIVACY_EXTERNAL_LEDGER_URL: "https://ledger.example.invalid/state",
    PRIVACY_EXTERNAL_LEDGER_TOKEN: "a".repeat(40),
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    DATA_KEY: "11".repeat(32),
    AUTH_SECRET: "fixture-secret-".repeat(5),
    ADMIN_PASSWORD: "fixture-password-".repeat(5),
    ADMIN_TOTP_SECRET: "ab".repeat(20),
  }))
    vi.stubEnv(k, v);
  vi.stubGlobal("fetch", send);
  const restored = join(dir, "restored.sqlite");
  await expect(
    withExternalDeletionProof(f.sourceId, [], () =>
      restoreEncryptedBackup(archive, restored, key, [], f.sourceId),
    ),
  ).rejects.toThrow();
  await withExternalDeletionProof(f.sourceId, rows, () =>
    restoreEncryptedBackup(archive, restored, key, rows, f.sourceId),
  );
  const copy = new DatabaseSync(restored);
  opened.push(copy);
  expect(copy.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(0);
  expect(copy.prepare("SELECT count(*) n FROM tickets").get()?.n).toBe(0);
  expect(collectDeletions(copy)).toEqual(rows);
  const rotated = join(dir, "rotated.sqlite");
  await withExternalDeletionProof(f.sourceId, rows, () =>
    rotateDataKey(
      restored,
      rotated,
      key,
      Buffer.alloc(32, 8),
      rows,
      f.sourceId,
    ),
  );
  const rotatedDb = new DatabaseSync(rotated);
  opened.push(rotatedDb);
  expect(rotatedDb.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(0);
});
it("audits hold review revisions and refuses an older or silently changed hold policy", async () => {
  const f = fixture();
  f.policy.heldOrders = [f.id];
  await runRetentionCycle(f.db, options(f));
  await expect(
    runRetentionCycle(f.db, {
      ...options(f),
      policy: { ...f.policy, heldOrders: [] },
    }),
  ).rejects.toThrow("RETENTION_POLICY_ROLLBACK_REFUSED");
  await expect(
    runRetentionCycle(f.db, {
      ...options(f),
      policy: { ...f.policy, reviewedAt: now - 1 },
    }),
  ).rejects.toThrow("RETENTION_POLICY_ROLLBACK_REFUSED");
  expect(
    f.db.prepare("SELECT count(*) n FROM retention_policy_reviews").get()?.n,
  ).toBe(1);
  expect(f.db.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  expect(
    await runRetentionCycle(f.db, {
      ...options(f),
      now: now + 1,
      policy: { ...f.policy, reviewedAt: now + 1, heldOrders: [] },
    }),
  ).toMatchObject({ orders: 1 });
  expect(
    f.db.prepare("SELECT count(*) n FROM retention_policy_reviews").get()?.n,
  ).toBe(2);
});
