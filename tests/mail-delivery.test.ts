import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db, one, all, run, tx, closeDb } from "../lib/db";
import { config } from "../lib/config";
import { hash, open, seal } from "../lib/security";
import { decryptJson } from "../lib/crypto";
import * as svc from "../lib/service";
import { MailDeliveryCoordinator } from "../lib/mail-delivery";
import { requestEmailChange } from "../lib/email-change";
import { createResendMailGateway } from "../lib/integrations/resend-mail";
import { runMailCycle, runPersistedMailCycle } from "../lib/mail-worker";
import { createMailCutoverFile } from "../lib/mail-cutover";
import type {
  MailGateway,
  MailEvidence,
} from "../lib/integrations/mail-gateway";
import type { MailEnvelope } from "../lib/mail-content";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
import { rotateDataKey } from "../lib/key-rotation";
const path = "var/mail-core-test.sqlite";
process.env.APP_MODE = "local";
process.env.EXTERNAL_EFFECTS = "disabled";
process.env.DATA_KEY = "d".repeat(64);
process.env.AUTH_SECRET = "mail-test-secret-".repeat(4);
process.env.ADMIN_PASSWORD = "mail-test-admin-".repeat(4);
process.env.ADMIN_TOTP_SECRET = "ab".repeat(20);
process.env.DATABASE_PATH = path;
const profile = {
  sender: "archive@example.invalid",
  replyTo: "support@example.invalid",
  origin: "http://localhost:3000",
};
const birth = {
  name: "가상메일검수",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "female",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
beforeAll(() => {
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(path + suffix, { force: true });
  db();
});
beforeEach(() => {
  db().exec(
    "DELETE FROM mail_notifications;DELETE FROM mail_queue;DELETE FROM mail_suppressions;DELETE FROM ticket_contacts;DELETE FROM toss_notifications;DELETE FROM toss_attempts;DELETE FROM session_auth;DELETE FROM email_changes;DELETE FROM admin_auth;DELETE FROM admin_totp_replay;DELETE FROM deletion_tombstones;DELETE FROM worker_heartbeat;DELETE FROM refunds;DELETE FROM reports;DELETE FROM jobs;DELETE FROM orders;DELETE FROM readings;DELETE FROM pg_ledger;DELETE FROM tickets;DELETE FROM outbox;DELETE FROM challenges;DELETE FROM sessions;DELETE FROM events;DELETE FROM audit;DELETE FROM rate_limits;",
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(path + suffix, { force: true });
});
function fixture() {
  const records = new Map<string, MailEvidence>();
  const gateway = {
    name: "synthetic-mail",
    idempotencyWindowMs: 86400000,
    send: vi.fn(async (_message: MailEnvelope, key: string) => {
      const providerId = "provider-" + key;
      records.set(key, {
        key,
        providerId,
        state: "accepted",
        authoritative: true,
      });
      return { key, providerId };
    }),
    lookup: vi.fn(
      async (key: string): Promise<MailEvidence> =>
        records.get(key) ?? { key, state: "not_sent", authoritative: true },
    ),
  };
  const mail = new MailDeliveryCoordinator(profile, gateway);
  const otp = (email = "buyer@example.invalid") => {
    const s = svc.newSession().session,
      cid = svc.requestOtp(s, email),
      code = svc.localOtp(s, cid).code;
    const row = all("SELECT * FROM outbox").find(
      (o) => open(o.payload).challengeId === cid,
    )!;
    return { s, cid, code, id: row.id as string, email };
  };
  return { mail, gateway, records, otp };
}
function customer(email = "buyer@example.invalid") {
  const f = fixture(),
    o = f.otp(email);
  svc.verifyOtp(o.s, o.cid, o.code);
  return one<svc.Session>("SELECT * FROM sessions WHERE id=?", o.s.id)!;
}
function admin() {
  const s = customer("admin@example.invalid");
  run("UPDATE sessions SET role='operations' WHERE id=?", s.id);
  run("INSERT INTO admin_auth VALUES(?,?)", s.id, Date.now());
  return { ...s, role: "operations" };
}
function paid() {
  const s = customer(),
    rid = svc.makeReading(s, birth),
    oid = svc.createOrder(s, rid, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    }),
    key = svc.mockAuthenticate(s, oid);
  svc.confirmPayment(s, oid, key, 22000);
  svc.workOnce();
  const id = all("SELECT * FROM outbox").find((o) => {
    const p = open(o.payload);
    return p.template === "report_ready" && p.orderId === oid;
  })!.id as string;
  return { s, oid, id };
}
describe("provider-neutral mail reliability, synthetic only", () => {
  it("keeps persisted enrollment disabled without reading its file or coordinator binding", async () => {
    const coordinator = {
      prepare: vi.fn(),
      workOnce: vi.fn(),
      get profileBinding(): string {
        throw Error("SHOULD_NOT_READ");
      },
    };
    expect(
      await runPersistedMailCycle(coordinator, {
        cutoverFile: "/does-not-exist",
      }),
    ).toEqual({ state: "disabled" });
    expect(coordinator.prepare).not.toHaveBeenCalled();
    expect(coordinator.workOnce).not.toHaveBeenCalled();
  });
  it("uses the persisted cutoff after restart and excludes old prepared mail plus restored holds", async () => {
    const f = fixture(),
      old = f.otp("old-cutover@example.invalid");
    const now = Date.now();
    run("UPDATE outbox SET created=? WHERE id=?", now, old.id);
    f.mail.prepare(old.id);
    run(
      "INSERT OR IGNORE INTO privacy_checkpoint_source VALUES(1,?)",
      "11111111-1111-4111-8111-111111111111",
    );
    const source = one(
      "SELECT source_id FROM privacy_checkpoint_source WHERE id=1",
    )!;
    const dir = mkdtempSync("var/mail-cutover-integration-"),
      file = dir + "/policy.json";
    try {
      createMailCutoverFile(
        file,
        { sourceId: source.source_id, profileDigest: f.mail.profileBinding },
        config().key,
        now,
      );
      vi.spyOn(Date, "now").mockReturnValue(now + 1000);
      const fresh = f.otp("new-cutover@example.invalid"),
        held = f.otp("held-cutover@example.invalid");
      run("UPDATE mail_queue SET recovery_hold=1 WHERE outbox_id=?", held.id);
      const changed = new MailDeliveryCoordinator(
        { ...profile, sender: "changed@example.invalid" },
        f.gateway,
      );
      await expect(
        runPersistedMailCycle(changed, { enabled: true, cutoverFile: file }),
      ).rejects.toThrow("MAIL_CUTOVER_MISMATCH");
      expect(f.gateway.send).not.toHaveBeenCalled();
      await runPersistedMailCycle(f.mail, { enabled: true, cutoverFile: file });
      expect(f.gateway.send).toHaveBeenCalledTimes(1);
      expect(
        one("SELECT state FROM mail_queue WHERE outbox_id=?", fresh.id)?.state,
      ).toBe("accepted");
      expect(
        one("SELECT state FROM mail_queue WHERE outbox_id=?", old.id)?.state,
      ).toBe("queued");
      expect(
        one("SELECT state FROM mail_queue WHERE outbox_id=?", held.id)?.state,
      ).toBe("local_only");
      const restarted = new MailDeliveryCoordinator(profile, f.gateway);
      await runPersistedMailCycle(restarted, {
        enabled: true,
        cutoverFile: file,
      });
      expect(f.gateway.send).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("keeps mail scheduler disabled before touching records or transports", async () => {
    const coordinator = { prepare: vi.fn(), workOnce: vi.fn() };
    expect(await runMailCycle(coordinator, { createdAtOrAfter: 0 })).toEqual({
      state: "disabled",
    });
    expect(coordinator.prepare).not.toHaveBeenCalled();
    expect(coordinator.workOnce).not.toHaveBeenCalled();
  });
  it("runs Resend HTTP parsing and durable scheduling together without treating acceptance as delivery", async () => {
    const f = fixture(),
      otp = f.otp();
    const pid = "11111111-1111-4111-8111-111111111111";
    let key = "";
    const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        key = new Headers(init.headers).get("Idempotency-Key")!;
        return new Response(JSON.stringify({ id: pid }));
      }
      return new Response(
        JSON.stringify({
          id: pid,
          last_event: "delivered",
          tags: [{ name: "gumseo_key", value: key }],
        }),
      );
    });
    const mail = new MailDeliveryCoordinator(
      profile,
      createResendMailGateway({
        apiKey: "re_synthetic_fixture",
        accountScope: "test-integration",
        enabled: true,
        fetch: send as typeof fetch,
      }),
    );
    await runMailCycle(mail, { enabled: true, createdAtOrAfter: 0 });
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", otp.id)?.state,
    ).toBe("accepted");
    expect(key).toBe("mail-" + otp.id);
    await mail.verify(otp.id);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", otp.id)?.state,
    ).toBe("delivered");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("keeps a sending-only Resend credential lookup failure from granting delivery or resending", async () => {
    const otp = fixture().otp();
    const pid = "11111111-1111-4111-8111-111111111111";
    const send = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ id: pid }))
        : new Response(JSON.stringify({ message: "restricted credential" }), {
            status: 401,
          }),
    );
    const mail = new MailDeliveryCoordinator(
      profile,
      createResendMailGateway({
        apiKey: "re_synthetic_fixture",
        accountScope: "test-integration",
        enabled: true,
        fetch: send as typeof fetch,
      }),
    );
    await runMailCycle(mail, { enabled: true, createdAtOrAfter: 0 });
    await mail.verify(otp.id);
    expect(
      one("SELECT state,provider_id FROM mail_queue WHERE outbox_id=?", otp.id),
    ).toMatchObject({ state: "uncertain", provider_id: pid });
    expect(
      send.mock.calls.filter((call) => call[1]?.method === "POST"),
    ).toHaveLength(1);
  });
  it("does not resend a Resend message when provider acknowledgement was lost", async () => {
    const otp = fixture().otp();
    const send = vi.fn(async () => {
      throw Error("synthetic acknowledgement lost");
    });
    const mail = new MailDeliveryCoordinator(
      profile,
      createResendMailGateway({
        apiKey: "re_synthetic_fixture",
        accountScope: "test-integration",
        enabled: true,
        fetch: send as typeof fetch,
      }),
    );
    await runMailCycle(mail, { enabled: true, createdAtOrAfter: 0 });
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", otp.id)?.state,
    ).toBe("uncertain");
    await mail.verify(otp.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", otp.id)?.state,
    ).not.toBe("delivered");
  });
  it("does not enroll historical local mail or restored quarantined messages", async () => {
    const f = fixture(),
      old = f.otp("old@example.invalid"),
      held = f.otp("held@example.invalid");
    run("UPDATE outbox SET created=1 WHERE id=?", old.id);
    f.mail.prepare(old.id);
    f.mail.prepare(held.id);
    run("UPDATE mail_queue SET recovery_hold=1 WHERE outbox_id=?", held.id);
    await runMailCycle(f.mail, { enabled: true, createdAtOrAfter: 2 });
    expect(f.gateway.send).not.toHaveBeenCalled();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", old.id)?.state,
    ).toBe("queued");
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", held.id)?.state,
    ).toBe("queued");
  });
  it("keeps the default provider disabled without making a network request", async () => {
    const f = fixture(),
      o = f.otp(),
      fetch = vi.spyOn(globalThis, "fetch");
    const blocked = new MailDeliveryCoordinator(profile);
    blocked.prepare(o.id);
    expect(await blocked.workOnce()).toEqual({ state: "disabled" });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("queued");
  });
  it("snapshots encrypted recipients and renders controlled OTP content without raw body injection", async () => {
    const f = fixture(),
      o = f.otp();
    const payload = open(
      one("SELECT payload FROM outbox WHERE id=?", o.id)!.payload,
    );
    payload.body = "<script>private</script>";
    run("UPDATE outbox SET payload=? WHERE id=?", seal(payload), o.id);
    f.mail.prepare(o.id);
    const message = open<MailEnvelope>(
      one("SELECT message_enc FROM mail_queue WHERE outbox_id=?", o.id)!
        .message_enc,
    );
    expect(message.to).toBe(o.email);
    expect(message.text).toContain(o.code);
    expect(message.subject).not.toContain(o.code);
    expect(message.html).not.toContain("<script>");
    const row = one("SELECT * FROM mail_queue WHERE outbox_id=?", o.id)!;
    expect(JSON.stringify(row)).not.toContain(o.email);
    await f.mail.workOnce();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("accepted");
    expect(one("SELECT status FROM outbox WHERE id=?", o.id)?.status).toBe(
      "provider_accepted",
    );
  });
  it("never treats provider acceptance as confirmed delivery", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const receipt = f.records.get("mail-" + o.id)!;
    f.mail.notify({
      providerId: receipt.providerId,
      eventId: "forged-delivery",
      state: "delivered",
    });
    await f.mail.workOnce();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("accepted");
    f.records.set(receipt.key, { ...receipt, state: "delivered" });
    await f.mail.verify(o.id);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("delivered");
  });
  it("looks up a lost send acknowledgement rather than sending again", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    f.gateway.send.mockImplementationOnce(async (_message, key) => {
      f.records.set(key, {
        key,
        providerId: "accepted-before-timeout",
        state: "accepted",
        authoritative: true,
      });
      throw Error("private-message-code-and-email");
    });
    expect((await f.mail.workOnce()).state).toBe("uncertain");
    await f.mail.verify(o.id);
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("accepted");
    expect(JSON.stringify(all("SELECT * FROM mail_queue"))).not.toContain(
      "private-message-code-and-email",
    );
  });
  it("retries the identical envelope/key only after authoritative not-sent evidence", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    f.gateway.send.mockRejectedValueOnce(Error("timeout"));
    await f.mail.workOnce();
    expect((await f.mail.verify(o.id)).state).toBe("retrying");
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
    run("UPDATE mail_queue SET scheduled=0 WHERE outbox_id=?", o.id);
    await f.mail.workOnce();
    expect(f.gateway.send).toHaveBeenCalledTimes(2);
    expect(f.gateway.send.mock.calls[1].slice(0, 2)).toEqual(
      f.gateway.send.mock.calls[0].slice(0, 2),
    );
  });
  it("stops ambiguous automatic retries after six failures", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    f.gateway.send.mockRejectedValueOnce(Error("timeout"));
    await f.mail.workOnce();
    f.gateway.lookup.mockResolvedValue({
      key: "mail-" + o.id,
      state: "unknown",
    });
    for (let n = 0; n < 5; n++) await f.mail.verify(o.id);
    expect(
      one(
        "SELECT state,failures,needs_check FROM mail_queue WHERE outbox_id=?",
        o.id,
      ),
    ).toMatchObject({ state: "review", failures: 6, needs_check: 0 });
    run("UPDATE mail_queue SET scheduled=0");
    expect(await f.mail.workOnce()).toEqual({ state: "idle" });
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
  });
  it.each(["expired", "consumed", "superseded", "attempts-exhausted"])(
    "cancels %s OTP before dispatch",
    async (kind) => {
      const f = fixture(),
        o = f.otp();
      f.mail.prepare(o.id);
      if (kind === "expired")
        run("UPDATE challenges SET expires=0 WHERE id=?", o.cid);
      if (kind === "consumed") svc.verifyOtp(o.s, o.cid, o.code);
      if (kind === "superseded") svc.requestOtp(o.s, o.email);
      if (kind === "attempts-exhausted")
        run("UPDATE challenges SET attempts=5 WHERE id=?", o.cid);
      await f.mail.workOnce();
      expect(f.gateway.send).not.toHaveBeenCalled();
      expect(
        one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
      ).toBe("canceled");
    },
  );
  it("does not send an email-change code after its verification attempts are exhausted", async () => {
    const f = fixture(),
      order = paid();
    const changeId = requestEmailChange(
      order.s,
      order.oid,
      "changed@example.invalid",
    );
    const mail = all("SELECT * FROM outbox").find(
      (o) => open(o.payload).changeId === changeId,
    )!;
    f.mail.prepare(mail.id);
    run("UPDATE email_changes SET attempts=5 WHERE id=?", changeId);
    await f.mail.workOnce();
    expect(f.gateway.send).not.toHaveBeenCalled();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", mail.id)?.state,
    ).toBe("canceled");
  });
  it("rejects stale report-ready messages after refund", async () => {
    const f = fixture(),
      o = paid();
    f.mail.prepare(o.id);
    svc.refund(admin(), o.oid, "모의 구매 환불 확인");
    await f.mail.workOnce();
    expect(f.gateway.send).not.toHaveBeenCalled();
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("canceled");
  });
  it("fences concurrent workers and recovers expired leases without duplicate sends", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    let release!: (r: { key: string; providerId: string }) => void;
    f.gateway.send.mockImplementationOnce(async (_message, key) => {
      f.records.set(key, {
        key,
        providerId: "in-flight",
        state: "accepted",
        authoritative: true,
      });
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = f.mail.workOnce();
    expect(await f.mail.workOnce()).toEqual({ state: "idle" });
    run("UPDATE mail_queue SET lease_until=0 WHERE outbox_id=?", o.id);
    const restarted = new MailDeliveryCoordinator(profile, f.gateway);
    await restarted.verify(o.id);
    release({ key: "mail-" + o.id, providerId: "in-flight" });
    await first;
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("accepted");
  });
  it("suppresses hard bounces only after authoritative lookup", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const r = f.records.get("mail-" + o.id)!;
    f.mail.notify({
      providerId: r.providerId,
      eventId: "spoof",
      state: "bounced",
    });
    await f.mail.workOnce();
    expect(one("SELECT count(*) n FROM mail_suppressions")?.n).toBe(0);
    f.records.set(r.key, { ...r, state: "bounced", permanent: true });
    await f.mail.verify(o.id);
    expect(
      one(
        "SELECT reason FROM mail_suppressions WHERE email_hash=?",
        hash(o.email),
      )?.reason,
    ).toBe("bounced");
    const next = f.otp();
    expect(f.mail.prepare(next.id).state).toBe("blocked");
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
  });
  it("does not globally suppress a soft bounce, and preserves delivered state on later lookup failure", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const r = f.records.get("mail-" + o.id)!;
    f.records.set(r.key, { ...r, state: "bounced", permanent: false });
    await f.mail.verify(o.id);
    expect(one("SELECT count(*) n FROM mail_suppressions")?.n).toBe(0);
    f.records.set(r.key, { ...r, state: "delivered" });
    await f.mail.verify(o.id);
    f.gateway.lookup.mockRejectedValueOnce(Error("offline"));
    await f.mail.verify(o.id);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("delivered");
  });
  it("deduplicates complaints and does not let late accepted evidence undo suppression", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const r = f.records.get("mail-" + o.id)!;
    const note = { providerId: r.providerId, eventId: "complaint" };
    expect(f.mail.notify(note).queued).toBe(true);
    expect(f.mail.notify(note).queued).toBe(false);
    f.records.set(r.key, { ...r, state: "complained" });
    await f.mail.workOnce();
    f.records.set(r.key, r);
    await f.mail.verify(o.id);
    expect(
      one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)?.state,
    ).toBe("complained");
    expect(
      JSON.stringify(all("SELECT * FROM mail_suppressions")),
    ).not.toContain(o.email);
  });
  it("ignores unknown provider identifiers without a lookup", () => {
    const f = fixture();
    expect(
      f.mail.notify({ providerId: "unknown", eventId: "unknown" }).queued,
    ).toBe(false);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
  });
  it("holds retry when idempotency retention has expired", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    f.gateway.send.mockRejectedValueOnce(Error("timeout"));
    await f.mail.workOnce();
    run(
      "UPDATE mail_queue SET first_dispatched=? WHERE outbox_id=?",
      Date.now() - 2 * 86400000,
      o.id,
    );
    expect((await f.mail.verify(o.id)).state).toBe("review");
    expect(f.gateway.send).toHaveBeenCalledTimes(1);
  });
  it("does not change a frozen sender/origin/provider profile", () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    const other = new MailDeliveryCoordinator(
      { ...profile, sender: "different@example.invalid" },
      f.gateway,
    );
    expect(() => other.prepare(o.id)).toThrow("설정");
  });
  it("keeps a support reply address after expiring the original auth challenge", async () => {
    const f = fixture(),
      s = customer("ticket@example.invalid"),
      tid = svc.ticket(s, {
        category: "other",
        message: "가상 구매 문의입니다",
      });
    run("DELETE FROM challenges");
    svc.answerTicket(admin(), tid, "가상 비공개 답변 원문입니다");
    const o = all("SELECT * FROM outbox").find(
      (o) => open(o.payload).ticketId === tid,
    )!;
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const message = f.gateway.send.mock.calls[0][0];
    expect(message.to).toBe("ticket@example.invalid");
    expect(message.text).not.toContain("비공개 답변 원문");
  });
  it("does not recreate a deleted outbox entry when a late provider acknowledgement arrives", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    let release!: (r: { key: string; providerId: string }) => void;
    f.gateway.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.mail.workOnce();
    run("DELETE FROM outbox WHERE id=?", o.id);
    release({ key: "mail-" + o.id, providerId: "late" });
    expect((await first).state).toBe("gone");
    expect(one("SELECT count(*) n FROM mail_queue")?.n).toBe(0);
  });
  it("restores financial content while revoking auth and holding restored mail for lookup", async () => {
    const f = fixture(),
      o = paid();
    f.mail.prepare(o.id);
    const auth = f.otp("second@example.invalid");
    f.mail.prepare(auth.id);
    const root = mkdtempSync("var/mail-restore-");
    try {
      const archive = root + "/source.gsb",
        target = root + "/copy.sqlite";
      await createEncryptedBackup(db(), archive, config().key);
      restoreEncryptedBackup(archive, target, config().key);
      const copy = new DatabaseSync(target, { readOnly: true });
      try {
        expect(copy.prepare("SELECT count(*) n FROM sessions").get()?.n).toBe(
          0,
        );
        expect(copy.prepare("SELECT count(*) n FROM challenges").get()?.n).toBe(
          0,
        );
        expect(
          copy
            .prepare(
              "SELECT state,recovery_hold FROM mail_queue WHERE outbox_id=?",
            )
            .get(o.id),
        ).toMatchObject({ state: "review", recovery_hold: 1 });
        expect(
          copy
            .prepare("SELECT payment_status FROM orders WHERE id=?")
            .get(o.oid)?.payment_status,
        ).toBe("paid");
        expect(
          copy
            .prepare("SELECT count(*) n FROM reports WHERE order_id=?")
            .get(o.oid)?.n,
        ).toBe(1);
      } finally {
        copy.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("re-encrypts mail recipient and rendered envelope during offline key rotation", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    const root = mkdtempSync("var/mail-rotate-"),
      next = Buffer.alloc(32, 6);
    try {
      const target = root + "/next.sqlite";
      await rotateDataKey(path, target, config().key, next, []);
      const copy = new DatabaseSync(target, { readOnly: true });
      try {
        const row = copy
          .prepare(
            "SELECT recipient_enc,message_enc FROM mail_queue WHERE outbox_id=?",
          )
          .get(o.id)!;
        expect(decryptJson(row.recipient_enc as string, next)).toBe(o.email);
        expect(
          decryptJson<MailEnvelope>(row.message_enc as string, next).text,
        ).toContain(o.code);
      } finally {
        copy.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rolls back recipient/outbox snapshots atomically with an enclosing transaction", () => {
    const before = one("SELECT count(*) n FROM outbox")!.n;
    expect(() =>
      tx(() => {
        svc.enqueueMail(
          hash("atomic@example.invalid"),
          { template: "report_link" },
          "atomic@example.invalid",
        );
        throw Error("rollback");
      }),
    ).toThrow("rollback");
    expect(one("SELECT count(*) n FROM outbox")?.n).toBe(before);
    expect(one("SELECT count(*) n FROM mail_queue")?.n).toBe(0);
    tx(() => {
      try {
        svc.enqueueMail(
          hash("wrong@example.invalid"),
          {},
          "different@example.invalid",
        );
      } catch {}
      run(
        "INSERT INTO audit(actor,action,target,created) VALUES('test','nested','none',0)",
      );
    });
    expect(one("SELECT count(*) n FROM mail_queue")?.n).toBe(0);
    expect(one("SELECT count(*) n FROM audit WHERE action='nested'")?.n).toBe(
      1,
    );
  });
  it("times out a hung provider call and never interprets it as a safe resend", async () => {
    const f = fixture(),
      o = f.otp();
    let signal: AbortSignal | undefined;
    const gateway: MailGateway = {
      ...f.gateway,
      send: async (_message, _key, s) => {
        signal = s;
        return new Promise(() => {});
      },
    };
    const coordinator = new MailDeliveryCoordinator(profile, gateway, {
      timeoutMs: 5,
    });
    coordinator.prepare(o.id);
    expect((await coordinator.workOnce()).state).toBe("uncertain");
    expect(signal?.aborted).toBe(true);
  });
  it("does not create a dispatch timestamp for an explicit lookup of an unsent message", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.verify(o.id);
    expect(
      one("SELECT first_dispatched FROM mail_queue WHERE outbox_id=?", o.id)
        ?.first_dispatched,
    ).toBeNull();
    expect(f.gateway.send).not.toHaveBeenCalled();
  });
  it("does not accept an unverified complaint as grounds to suppress a recipient", async () => {
    const f = fixture(),
      o = f.otp();
    f.mail.prepare(o.id);
    await f.mail.workOnce();
    const r = f.records.get("mail-" + o.id)!;
    f.records.set(r.key, { ...r, state: "complained", authoritative: false });
    await f.mail.verify(o.id);
    expect(one("SELECT count(*) n FROM mail_suppressions")?.n).toBe(0);
  });
  it("does not resend a restored old message outside provider idempotency retention", async () => {
    const f = fixture(),
      o = paid();
    f.mail.prepare(o.id);
    run(
      "UPDATE mail_queue SET state='review',recovery_hold=1 WHERE outbox_id=?",
      o.id,
    );
    run(
      "UPDATE outbox SET created=? WHERE id=?",
      Date.now() - 2 * 86400000,
      o.id,
    );
    expect((await f.mail.verify(o.id)).state).toBe("review");
    expect(f.gateway.send).not.toHaveBeenCalled();
  });
  it("keeps a support request and its encrypted contact in one transaction", () => {
    const s = customer("atomic-ticket@example.invalid");
    db().exec(
      "CREATE TRIGGER mail_contact_failure BEFORE INSERT ON ticket_contacts BEGIN SELECT RAISE(ABORT,'synthetic contact failure'); END;",
    );
    try {
      expect(() =>
        svc.ticket(s, { category: "other", message: "원자성 문의 처리 검증" }),
      ).toThrow();
    } finally {
      db().exec("DROP TRIGGER mail_contact_failure");
    }
    expect(one("SELECT count(*) n FROM tickets")?.n).toBe(0);
    expect(one("SELECT count(*) n FROM ticket_contacts")?.n).toBe(0);
  });
  it("rejects asynchronous transaction callbacks before they can run", () => {
    let ran = false;
    expect(() =>
      tx(async () => {
        ran = true;
      }),
    ).toThrow("ASYNC_TRANSACTION");
    expect(ran).toBe(false);
  });
});

it("connects the Resend HTTP adapter to the DB queue with intercepted requests, preserving acceptance/delivery separation", async () => {
  const { createResendMailGateway } =
    await import("../lib/integrations/resend-mail");
  const f = fixture(),
    o = f.otp(),
    pid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: pid }))
    .mockResolvedValueOnce(
      Response.json({
        id: pid,
        last_event: "delivered",
        tags: [{ name: "gumseo_key", value: "mail-" + o.id }],
      }),
    );
  const coordinator = new MailDeliveryCoordinator(
    profile,
    createResendMailGateway({
      apiKey: "re_synthetic_fixture_only",
      accountScope: "synthetic",
      enabled: true,
      fetch: send,
    }),
  );
  coordinator.prepare(o.id);
  expect((await coordinator.workOnce()).state).toBe("accepted");
  expect((await coordinator.verify(o.id)).state).toBe("delivered");
  expect(send).toHaveBeenCalledTimes(2);
  expect(one("SELECT status FROM outbox WHERE id=?", o.id)!.status).toBe(
    "delivered",
  );
});

it("deduplicates signed Resend receipts, ignores their bounce claim, and changes state only after independent lookup", async () => {
  const { receiveResendWebhook } =
    await import("../lib/integrations/resend-webhook");
  const { createHmac } = await import("node:crypto");
  const f = fixture(),
    o = f.otp();
  f.mail.prepare(o.id);
  await f.mail.workOnce();
  const raw = JSON.stringify({
    type: "email.bounced",
    data: { email_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  });
  // Bind the fixture provider UUID just as the real adapter does on accepted response.
  run(
    "UPDATE mail_queue SET provider_id=? WHERE outbox_id=?",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    o.id,
  );
  const secret = Buffer.alloc(32, 11),
    timestamp = String(Math.floor(Date.now() / 1000)),
    eventId = "msg_synthetic_repeated";
  const signature = createHmac("sha256", secret)
    .update(eventId + "." + timestamp + "." + raw)
    .digest("base64");
  const req = () =>
    new Request("https://example.invalid/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": "v1," + signature,
      },
      body: raw,
    });
  const options = {
    secret: "whsec_" + secret.toString("base64"),
    coordinator: f.mail,
  };
  expect((await receiveResendWebhook(req(), options)).queued).toBe(true);
  expect((await receiveResendWebhook(req(), options)).queued).toBe(false);
  expect(
    one("SELECT state FROM mail_queue WHERE outbox_id=?", o.id)!.state,
  ).toBe("accepted");
  expect(all("SELECT * FROM mail_suppressions")).toHaveLength(0);
  f.gateway.lookup.mockResolvedValueOnce({
    key: "mail-" + o.id,
    providerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    state: "delivered",
    authoritative: true,
  });
  expect((await f.mail.verify(o.id)).state).toBe("delivered");
  expect(f.gateway.send).toHaveBeenCalledOnce();
});
