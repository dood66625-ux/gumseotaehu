import { createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  verifyTossWebhookSignature,
  receiveTossWebhook,
} from "../lib/integrations/toss-webhook";
import { readRawBody } from "../lib/raw-body";
import { TossOrderCoordinator } from "../lib/integrations/toss-orders";
import { db, closeDb, one, run, all } from "../lib/db";
import * as svc from "../lib/service";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import { POST } from "../app/api/toss/webhook/route";
import vector from "./fixtures/toss-hmac.json";
const securityKey = Buffer.alloc(32, 0x12),
  path = "./var/toss-webhook-test.sqlite",
  mid = "synthetic-mid";
const signedTime = new Date().toISOString();
process.env.APP_MODE = "local";
process.env.EXTERNAL_EFFECTS = "disabled";
process.env.DATA_KEY = "d".repeat(64);
process.env.AUTH_SECRET = "hook-test-secret-".repeat(4);
process.env.ADMIN_PASSWORD = "hook-test-admin-".repeat(4);
process.env.ADMIN_TOTP_SECRET = "ab".repeat(20);
process.env.DATABASE_PATH = path;
beforeAll(() => {
  for (const x of ["", "-wal", "-shm"]) rmSync(path + x, { force: true });
  db();
});
beforeEach(() => {
  db().exec(
    "DELETE FROM toss_notifications;DELETE FROM toss_attempts;DELETE FROM reports;DELETE FROM jobs;DELETE FROM orders;DELETE FROM readings;DELETE FROM pg_ledger;DELETE FROM mail_queue;DELETE FROM outbox;DELETE FROM challenges;DELETE FROM session_auth;DELETE FROM sessions;DELETE FROM events;DELETE FROM audit;DELETE FROM rate_limits;",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  closeDb();
  for (const x of ["", "-wal", "-shm"]) rmSync(path + x, { force: true });
});
function sign(raw: string, time = signedTime, key = securityKey) {
  return (
    "v1:" +
    createHmac("sha256", key)
      .update(raw)
      .update(":")
      .update(time)
      .digest("base64")
  );
}
function headers(raw: string, time = signedTime) {
  return new Headers({
    "content-type": "application/json",
    "tosspayments-webhook-transmission-time": time,
    "tosspayments-webhook-transmission-id":
      "opaque transmission id / not an event id",
    "tosspayments-webhook-signature": sign(raw, time),
  });
}
function request(body: unknown, time?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost:3000/api/toss/webhook", {
    method: "POST",
    headers: headers(raw, time),
    body: raw,
  });
}
async function fixture() {
  const { session: initial } = svc.newSession();
  const cid = svc.requestOtp(initial, "hook@example.invalid");
  svc.verifyOtp(initial, cid, svc.localOtp(initial, cid).code);
  const session = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    initial.id,
  )!;
  const rid = svc.makeReading(session, syntheticBirths.known);
  const oid = svc.createOrder(session, rid, {
    terms: true,
    privacy: true,
    withdrawal: true,
    confirmedBirth: true,
    buyerAdult: true,
  });
  const payment = {
    orderId: oid,
    paymentKey: "opaque/payment key?한글",
    mId: mid,
    currency: "KRW",
    type: "NORMAL",
    totalAmount: 33000,
    balanceAmount: 33000,
    status: "DONE" as const,
    approvedAt: new Date().toISOString(),
  };
  const gateway = {
    confirm: vi.fn(async () => {
      throw Error("synthetic lost acknowledgement");
    }),
    lookup: vi.fn(async () => payment),
    cancel: vi.fn(async () => payment),
  };
  const coordinator = new TossOrderCoordinator(gateway, mid);
  await expect(
    coordinator.confirm(session, oid, payment.paymentKey, 33000),
  ).rejects.toMatchObject({ status: 503 });
  const body = {
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-11-15T00:00:00.000000",
    data: {
      ...payment,
      customerEmail: "sensitive-provider-marker@example.invalid",
    },
  };
  return {
    session,
    oid,
    payment,
    gateway,
    coordinator,
    body,
    options: { securityKey, merchantId: mid, coordinator },
  };
}
it("matches an independent Python HMAC byte vector, including UTF-8", () => {
  const h = new Headers({
    "tosspayments-webhook-transmission-time": vector.time,
    "tosspayments-webhook-signature": "v1:" + vector.signature,
  });
  expect(() =>
    verifyTossWebhookSignature(
      Buffer.from(vector.raw),
      h,
      securityKey,
      Date.parse(vector.time),
    ),
  ).not.toThrow();
  expect(() =>
    verifyTossWebhookSignature(Buffer.from(vector.raw + " "), h, securityKey),
  ).toThrow("INVALID_TOSS_WEBHOOK_SIGNATURE");
});
it("supports signature rotation, unknown versions, and headers longer than one KiB", () => {
  const raw = '{"fixture":true}',
    h = headers(raw);
  const invalid = "v1:" + Buffer.alloc(32, 1).toString("base64");
  h.set(
    "tosspayments-webhook-signature",
    ["v2:future", ...Array(30).fill(invalid), sign(raw)].join(", "),
  );
  expect(h.get("tosspayments-webhook-signature")!.length).toBeGreaterThan(1024);
  expect(() =>
    verifyTossWebhookSignature(Buffer.from(raw), h, securityKey),
  ).not.toThrow();
});
it.each([
  "body",
  "time",
  "key",
  "missing-time",
  "missing-signature",
  "noncanonical",
  "oversized-header",
])("rejects altered %s authentication", (kind) => {
  let raw = '{"fixture":true}';
  const h = headers(raw);
  let key = securityKey;
  if (kind === "body") raw = '{"fixture":false}';
  if (kind === "time")
    h.set("tosspayments-webhook-transmission-time", "changed");
  if (kind === "key") key = Buffer.alloc(32, 0x13);
  if (kind === "missing-time")
    h.delete("tosspayments-webhook-transmission-time");
  if (kind === "missing-signature") h.delete("tosspayments-webhook-signature");
  if (kind === "noncanonical")
    h.set("tosspayments-webhook-signature", "v1:" + "!".repeat(44));
  if (kind === "oversized-header")
    h.set("tosspayments-webhook-signature", "x".repeat(8193));
  expect(() => verifyTossWebhookSignature(Buffer.from(raw), h, key)).toThrow(
    "INVALID_TOSS_WEBHOOK_SIGNATURE",
  );
});
it("acknowledges a signed hint without granting access; an independent lookup then recovers the lost approval and original report", async () => {
  const f = await fixture();
  const result = await receiveTossWebhook(request(f.body), f.options);
  expect(result).toEqual({ accepted: true, queued: true });
  expect(f.gateway.lookup).not.toHaveBeenCalled();
  expect(
    one("SELECT payment_status FROM orders WHERE id=?", f.oid)?.payment_status,
  ).toBe("pending");
  expect(() => svc.getReport(f.session, f.oid)).toThrow();
  await f.coordinator.recoverPending();
  expect(f.gateway.lookup).toHaveBeenCalledOnce();
  expect(
    one("SELECT payment_status FROM orders WHERE id=?", f.oid)?.payment_status,
  ).toBe("paid");
  svc.workOnce();
  expect(svc.getReport(f.session, f.oid).report).toEqual(
    svc.getReport(f.session, f.oid).report,
  );
  expect(JSON.stringify(all("SELECT * FROM toss_notifications"))).not.toContain(
    "sensitive-provider-marker",
  );
});
it("deduplicates an opaque eventId across different transmission times/IDs", async () => {
  const f = await fixture(),
    body = { ...f.body, eventId: "결제 event / opaque ?" };
  expect((await receiveTossWebhook(request(body), f.options)).queued).toBe(
    true,
  );
  expect(
    (
      await receiveTossWebhook(
        request(body, new Date(Date.now() - 1000).toISOString()),
        f.options,
      )
    ).queued,
  ).toBe(false);
  expect(one("SELECT count(*) n FROM toss_notifications")?.n).toBe(1);
});
it("deduplicates events lacking eventId despite JSON key order, spacing, and delivery metadata changes", async () => {
  const f = await fixture();
  expect((await receiveTossWebhook(request(f.body), f.options)).queued).toBe(
    true,
  );
  const changed = JSON.stringify(
    {
      data: {
        status: f.payment.status,
        mId: mid,
        paymentKey: f.payment.paymentKey,
        orderId: f.oid,
      },
      createdAt: f.body.createdAt,
      eventType: f.body.eventType,
    },
    null,
    2,
  );
  expect(
    (
      await receiveTossWebhook(
        request(changed, new Date(Date.now() - 1000).toISOString()),
        f.options,
      )
    ).queued,
  ).toBe(false);
  expect(one("SELECT count(*) n FROM toss_notifications")?.n).toBe(1);
});
it.each(["unknown-order", "wrong-payment-key", "wrong-merchant"])(
  "does not queue %s",
  async (kind) => {
    const f = await fixture();
    if (kind === "unknown-order")
      f.body.data.orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    if (kind === "wrong-payment-key")
      f.body.data.paymentKey = "another opaque key";
    if (kind === "wrong-merchant") f.body.data.mId = "another-mid";
    if (kind === "wrong-merchant")
      await expect(
        receiveTossWebhook(request(f.body), f.options),
      ).rejects.toThrow("MERCHANT_MISMATCH");
    else
      expect(
        (await receiveTossWebhook(request(f.body), f.options)).queued,
      ).toBe(false);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
    expect(one("SELECT count(*) n FROM toss_notifications")?.n).toBe(0);
  },
);
it("validates the signature before parsing JSON and rejects signed malformed or incomplete JSON", async () => {
  const f = await fixture();
  const r = request("{invalid");
  r.headers.set("tosspayments-webhook-signature", sign("different"));
  await expect(receiveTossWebhook(r, f.options)).rejects.toThrow(
    "INVALID_TOSS_WEBHOOK_SIGNATURE",
  );
  await expect(
    receiveTossWebhook(request("{invalid"), f.options),
  ).rejects.toThrow("INVALID_TOSS_WEBHOOK_JSON");
  await expect(
    receiveTossWebhook(
      request({ eventType: "PAYMENT_STATUS_CHANGED" }),
      f.options,
    ),
  ).rejects.toThrow("INVALID_TOSS_WEBHOOK_EVENT");
});
it("ignores authenticated unrelated product events without queueing", async () => {
  const f = await fixture();
  expect(
    await receiveTossWebhook(
      request({
        eventType: "BILLING_DELETED",
        data: { billingKey: "synthetic" },
      }),
      f.options,
    ),
  ).toEqual({ accepted: true, queued: false });
  expect(one("SELECT count(*) n FROM toss_notifications")?.n).toBe(0);
});
it("signed status/amount claims cannot replace the independent provider's financial evidence", async () => {
  const f = await fixture();
  await receiveTossWebhook(request(f.body), f.options);
  f.gateway.lookup.mockResolvedValue({ ...f.payment, totalAmount: 1 });
  await f.coordinator.recoverPending();
  expect(
    one("SELECT payment_status FROM orders WHERE id=?", f.oid)?.payment_status,
  ).toBe("pending");
  expect(svc.workOnce()).toBe(false);
});
it("new HTTP route stays disabled by default and rejects live-key configuration", async () => {
  vi.stubEnv("TOSS_TEST_WEBHOOK_MODE", "disabled");
  const r = request({});
  expect((await POST(r)).status).toBe(503);
  expect(r.bodyUsed).toBe(false);
  vi.stubEnv("TOSS_TEST_WEBHOOK_MODE", "signed-test-only");
  vi.stubEnv("TOSS_TEST_WEBHOOK_SECURITY_KEY", securityKey.toString("hex"));
  vi.stubEnv("TOSS_TEST_MERCHANT_ID", mid);
  vi.stubEnv("TOSS_TEST_SECRET_KEY", "live_sk_synthetic_not_real");
  expect((await POST(request({}))).status).toBe(503);
});
it("configured test receiver returns 200 immediately after durable queueing and never invokes fetch", async () => {
  const f = await fixture();
  vi.stubEnv("TOSS_TEST_WEBHOOK_MODE", "signed-test-only");
  vi.stubEnv("TOSS_TEST_WEBHOOK_SECURITY_KEY", securityKey.toString("hex"));
  vi.stubEnv("TOSS_TEST_MERCHANT_ID", mid);
  vi.stubEnv("TOSS_TEST_SECRET_KEY", "test_sk_synthetic_not_real");
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const response = await POST(request(f.body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ accepted: true, queued: true });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(
    one("SELECT payment_status FROM orders WHERE id=?", f.oid)?.payment_status,
  ).toBe("pending");
});
it("bounds raw body bytes when Content-Length is absent or false", async () => {
  for (const length of [undefined, "1"]) {
    const r = new Request("http://localhost", {
      method: "POST",
      headers: length ? { "content-length": length } : {},
      body: "x".repeat(100),
    });
    await expect(readRawBody(r, 20)).rejects.toMatchObject({ status: 413 });
  }
});
it("enforces a total read deadline and cancels a stalled body", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({ pull() {}, cancel });
  const r = new Request("http://localhost", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await expect(readRawBody(r, 100, 5)).rejects.toMatchObject({ status: 408 });
  expect(cancel).toHaveBeenCalledOnce();
});
it.each(["old", "future", "unparseable"])(
  "rejects a correctly signed but %s delivery timestamp",
  (kind) => {
    const time =
      kind === "old"
        ? new Date(Date.now() - 6 * 60000).toISOString()
        : kind === "future"
          ? new Date(Date.now() + 60000).toISOString()
          : "not-a-timestamp";
    const raw = '{"synthetic":true}';
    expect(() =>
      verifyTossWebhookSignature(
        Buffer.from(raw),
        headers(raw, time),
        securityKey,
      ),
    ).toThrow("STALE_TOSS_WEBHOOK");
  },
);
it("accepts a fresh delivery of an old event; retries are not judged by event creation time", async () => {
  const f = await fixture();
  f.body.createdAt = "2020-01-01T00:00:00.000000";
  expect((await receiveTossWebhook(request(f.body), f.options)).queued).toBe(
    true,
  );
});
it.each(["application/jsonp", "text/plain"])(
  "rejects unsupported content type %s before consuming bytes",
  async (contentType) => {
    const f = await fixture(),
      r = request(f.body);
    r.headers.set("content-type", contentType);
    await expect(receiveTossWebhook(r, f.options)).rejects.toMatchObject({
      status: 415,
    });
    expect(r.bodyUsed).toBe(false);
  },
);
it("rejects compressed webhook bodies instead of silently changing signed bytes", async () => {
  const f = await fixture(),
    r = request(f.body);
  r.headers.set("content-encoding", "gzip");
  await expect(receiveTossWebhook(r, f.options)).rejects.toMatchObject({
    status: 415,
  });
  expect(r.bodyUsed).toBe(false);
});
