import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  ExternalDeletionLedger,
  withExternalDeletionProof,
  requireExternalDeletionProof,
} from "../lib/external-deletion-ledger";
import { restoreEncryptedBackup } from "../lib/backup";
const key = Buffer.from("11".repeat(32), "hex"),
  sourceId = "11111111-1111-4111-8111-111111111111",
  orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function storage() {
  let body: string | undefined,
    version = 0,
    fail = false;
  const send = vi.fn(async (_url: any, init: any) => {
    if (fail) return Response.json({ private: "not-logged" }, { status: 503 });
    if (init.method === "GET")
      return body
        ? new Response(body, { headers: { etag: '"v' + version + '"' } })
        : new Response(null, { status: 404 });
    if (
      (body && init.headers["If-Match"] !== '"v' + version + '"') ||
      (!body && init.headers["If-None-Match"] !== "*")
    )
      return new Response(null, { status: 412 });
    body = init.body;
    version++;
    return new Response(null, { status: 200 });
  });
  return {
    send,
    get body() {
      return body;
    },
    get version() {
      return version;
    },
    fail() {
      fail = true;
    },
  };
}
const state = () => ({
  sourceId,
  generatedAt: Date.now(),
  rows: [{ orderId, deletedAt: Date.now() - 1000 }],
  pending: false,
});
beforeEach(() => {
  for (const [k, v] of Object.entries({
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    DATA_KEY: "11".repeat(32),
    AUTH_SECRET: "synthetic-signing-".repeat(3),
    ADMIN_PASSWORD: "synthetic-password-".repeat(3),
    ADMIN_TOTP_SECRET: "ab".repeat(20),
    PRIVACY_EXTERNAL_LEDGER_MODE: "disabled",
  }))
    vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("encrypts deletion IDs and round-trips only through conditional writes", async () => {
  const s = storage(),
    client = new ExternalDeletionLedger(
      "https://ledger.example.invalid/object",
      "a".repeat(64),
      key,
      s.send as typeof fetch,
    ),
    value = state();
  await client.publish(value);
  expect(s.body).not.toContain(orderId);
  expect((await client.verify(sourceId, value.rows)).rows).toEqual(value.rows);
  await client.publish(value);
  expect(s.version).toBe(1);
  expect(s.send.mock.calls.every((c) => c[1].redirect === "error")).toBe(true);
});
it("rejects history rollback, wrong source, stale/pending data and unavailable storage", async () => {
  const s = storage(),
    client = new ExternalDeletionLedger(
      "https://ledger.example.invalid/object",
      "a".repeat(64),
      key,
      s.send as typeof fetch,
    ),
    value = state();
  await client.publish(value);
  await expect(
    client.publish({ ...value, generatedAt: value.generatedAt + 1, rows: [] }),
  ).rejects.toThrow("HISTORY_REGRESSION");
  await expect(client.latest(orderId)).rejects.toThrow("SOURCE_MISMATCH");
  await expect(client.verify(sourceId, [])).rejects.toThrow("RESTORE_BLOCKED");
  await client.publish({ ...value, pending: true });
  await expect(client.verify(sourceId, value.rows)).rejects.toThrow(
    "RESTORE_BLOCKED",
  );
  s.fail();
  await expect(client.latest(sourceId)).rejects.toThrow("UNAVAILABLE");
});
it("requires a live remote proof at the backup API and rechecks after the staged action", async () => {
  const s = storage(),
    client = new ExternalDeletionLedger(
      "https://ledger.example.invalid/object",
      "a".repeat(64),
      key,
      s.send as typeof fetch,
    ),
    value = state();
  await client.publish(value);
  vi.stubGlobal("fetch", s.send);
  vi.stubEnv("PRIVACY_EXTERNAL_LEDGER_MODE", "conditional-https");
  vi.stubEnv(
    "PRIVACY_EXTERNAL_LEDGER_APPROVAL",
    "encrypted-deletion-ledger-approved",
  );
  vi.stubEnv(
    "PRIVACY_EXTERNAL_LEDGER_URL",
    "https://ledger.example.invalid/object",
  );
  vi.stubEnv("PRIVACY_EXTERNAL_LEDGER_TOKEN", "a".repeat(64));
  expect(() =>
    restoreEncryptedBackup("missing", "unused", key, value.rows, sourceId),
  ).toThrow("EXTERNAL_DELETION_PROOF_REQUIRED");
  expect(
    await withExternalDeletionProof(sourceId, value.rows, () => {
      requireExternalDeletionProof(sourceId, value.rows);
      return true;
    }),
  ).toBe(true);
  await expect(
    withExternalDeletionProof(sourceId, value.rows, async () => {
      await client.publish({
        ...value,
        generatedAt: value.generatedAt + 1,
        rows: [
          ...value.rows,
          {
            orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            deletedAt: value.generatedAt,
          },
        ],
      });
    }),
  ).rejects.toThrow("RESTORE_BLOCKED");
});
it("refuses full-erasure downgrades and treats dispute IDs separately from order IDs", async () => {
  const store = storage(),
    remote = new ExternalDeletionLedger(
      "https://ledger.example.invalid/state",
      "a".repeat(40),
      key,
      store.send as typeof fetch,
    ),
    s = state();
  const rows = [
    { ...s.rows[0], scope: "full" as const },
    { ...s.rows[0], scope: "dispute" as const },
  ];
  await remote.publish({ ...s, rows });
  await remote.verify(s.sourceId, rows);
  await expect(remote.publish({ ...s, rows: s.rows })).rejects.toThrow(
    "EXTERNAL_LEDGER_HISTORY_REGRESSION",
  );
});
it("rejects conditional write conflicts and corrupted ciphertext without accepting a new version", async () => {
  const store = storage(),
    s = state();
  const conflict = vi.fn(async (url: any, init: any) =>
    init.method === "PUT"
      ? new Response(null, { status: 412 })
      : store.send(url, init),
  );
  const remote = new ExternalDeletionLedger(
    "https://ledger.example.invalid/state",
    "a".repeat(40),
    key,
    conflict as typeof fetch,
  );
  await expect(remote.publish(s)).rejects.toThrow(
    "EXTERNAL_LEDGER_UNAVAILABLE",
  );
  expect(store.version).toBe(0);
  const valid = new ExternalDeletionLedger(
    "https://ledger.example.invalid/state",
    "a".repeat(40),
    key,
    store.send as typeof fetch,
  );
  await valid.publish(s);
  const corrupt = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          version: 1,
          ciphertext: Buffer.alloc(64).toString("base64"),
        }),
        { headers: { etag: '"v1"' } },
      ),
  );
  await expect(
    new ExternalDeletionLedger(
      "https://ledger.example.invalid/state",
      "a".repeat(40),
      key,
      corrupt as typeof fetch,
    ).verify(s.sourceId, s.rows),
  ).rejects.toThrow();
});
