import { createTossTestTransport } from "../lib/integrations/toss-http";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { rotateDataKey } from "../lib/key-rotation";
import { decryptJson } from "../lib/crypto";
import { config } from "../lib/config";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { rmSync } from "node:fs";
import { db, all, one, run, closeDb } from "../lib/db";
import * as svc from "../lib/service";
import { TossOrderCoordinator } from "../lib/integrations/toss-orders";
import {
  TossTestContract,
  type VerifiedPayment,
} from "../lib/integrations/toss";
import { hash, open } from "../lib/security";
const path = "var/toss-orders-test.sqlite";
process.env.APP_MODE = "local";
process.env.EXTERNAL_EFFECTS = "disabled";
process.env.DATA_KEY = "c".repeat(64);
process.env.AUTH_SECRET = "test-secret-".repeat(5);
process.env.ADMIN_PASSWORD = "test-admin-".repeat(5);
process.env.ADMIN_TOTP_SECRET = "ab".repeat(20);
process.env.DATABASE_PATH = path;
const birth = {
  name: "가상결제검수",
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
    "DELETE FROM toss_notifications;DELETE FROM toss_attempts;DELETE FROM session_auth;DELETE FROM email_changes;DELETE FROM admin_auth;DELETE FROM admin_totp_replay;DELETE FROM deletion_tombstones;DELETE FROM worker_heartbeat;DELETE FROM refunds;DELETE FROM reports;DELETE FROM jobs;DELETE FROM orders;DELETE FROM readings;DELETE FROM pg_ledger;DELETE FROM tickets;DELETE FROM outbox;DELETE FROM challenges;DELETE FROM sessions;DELETE FROM events;DELETE FROM audit;DELETE FROM rate_limits;",
  );
});
afterAll(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(path + suffix, { force: true });
});
function customer(email = "buyer@example.invalid") {
  const original = svc.newSession(),
    cid = svc.requestOtp(original.session, email);
  svc.verifyOtp(
    original.session,
    cid,
    svc.localOtp(original.session, cid).code,
  );
  return one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    original.session.id,
  )!;
}
function fixture(amount = 22000) {
  const s = customer(),
    rid = svc.makeReading(s, birth),
    oid = svc.createOrder(s, rid, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    });
  if (amount !== 22000)
    run("UPDATE orders SET amount=? WHERE id=?", amount, oid);
  const payment: VerifiedPayment = {
    paymentKey: "synthetic-toss-key",
    orderId: oid,
    mId: "synthetic-mid",
    currency: "KRW",
    type: "NORMAL",
    totalAmount: amount,
    balanceAmount: amount,
    status: "DONE",
    approvedAt: new Date().toISOString(),
  };
  let current = payment;
  const gateway = {
    confirm: vi.fn(async () => current),
    lookup: vi.fn(async () => current),
    cancel: vi.fn(async () => current),
  };
  const coordinator = new TossOrderCoordinator(gateway, "synthetic-mid");
  const admin = () => {
    const a = customer("admin@example.invalid");
    run("UPDATE sessions SET role='operations' WHERE id=?", a.id);
    run("INSERT INTO admin_auth VALUES(?,?)", a.id, Date.now());
    return { ...a, role: "operations" };
  };
  const canceled = () => ({
    ...payment,
    status: "CANCELED" as const,
    balanceAmount: 0,
    cancels: [
      {
        transactionKey: "synthetic-cancel",
        cancelAmount: amount,
        cancelStatus: "DONE",
      },
    ],
  });
  return {
    s,
    rid,
    oid,
    payment,
    gateway,
    coordinator,
    admin,
    canceled,
    set: (p: VerifiedPayment) => {
      current = p;
    },
  };
}
describe("Toss test adapter to durable orders, synthetic gateway only", () => {
  it("rejects price and ownership changes before a gateway call", async () => {
    const f = fixture();
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 1),
    ).rejects.toThrow("금액");
    await expect(
      f.coordinator.confirm(
        customer("stranger@example.invalid"),
        f.oid,
        f.payment.paymentKey,
        22000,
      ),
    ).rejects.toThrow();
    expect(f.gateway.confirm).not.toHaveBeenCalled();
    expect(one("SELECT count(*) n FROM toss_attempts")?.n).toBe(0);
  });
  it("settles server-verified evidence, creates one report job and preserves original approval time", async () => {
    const f = fixture();
    f.payment.approvedAt = new Date(Date.now() - 30000).toISOString();
    expect(
      await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).toEqual({ state: "verified" });
    expect(
      await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).toEqual({ state: "verified" });
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
    expect(svc.ownOrder(f.s, f.oid).paid_at).toBe(
      Date.parse(f.payment.approvedAt!),
    );
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(1);
    svc.workOnce();
    const original = svc.getReport(f.s, f.oid).report;
    svc.workOnce();
    expect(svc.getReport(f.s, f.oid).report).toEqual(original);
  });
  it.each([
    { mId: "wrong-mid" },
    { currency: "USD" },
    { type: "BILLING" },
    { totalAmount: 1 },
    { balanceAmount: 1 },
    { approvedAt: null },
    { paymentKey: "wrong-key" },
  ])("never grants a report for mismatched evidence %j", async (patch) => {
    const f = fixture();
    f.set({ ...f.payment, ...patch } as VerifiedPayment);
    const result = await f.coordinator
      .confirm(f.s, f.oid, f.payment.paymentKey, 22000)
      .catch(() => ({ state: "uncertain" }));
    expect(result.state).not.toBe("verified");
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(0);
  });
  it("uses lookup after an approval timeout, including a newly constructed process adapter", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("sensitive-provider-text"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow("추가 결제 없이");
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
    const restarted = new TossOrderCoordinator(f.gateway, "synthetic-mid");
    expect(await restarted.recover(f.oid)).toEqual({ state: "verified" });
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
    expect(f.gateway.lookup).toHaveBeenCalledTimes(1);
    expect(one("SELECT last_error FROM toss_attempts")?.last_error).toBeNull();
    expect(JSON.stringify(all("SELECT * FROM toss_attempts"))).not.toContain(
      "sensitive-provider-text",
    );
  });
  it("fences concurrent callbacks and does not dispatch a second approval", async () => {
    const f = fixture();
    let release!: (p: VerifiedPayment) => void;
    f.gateway.confirm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.coordinator.confirm(
      f.s,
      f.oid,
      f.payment.paymentKey,
      22000,
    );
    expect(
      await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).toEqual({ state: "processing" });
    release(f.payment);
    await first;
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(1);
  });
  it("ignores late results after another recovery owns the lease", async () => {
    const f = fixture();
    let release!: (p: VerifiedPayment) => void;
    f.gateway.confirm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.coordinator.confirm(
      f.s,
      f.oid,
      f.payment.paymentKey,
      22000,
    );
    run("UPDATE toss_attempts SET lease_until=0 WHERE order_id=?", f.oid);
    await f.coordinator.recover(f.oid);
    release(f.canceled());
    expect(await first).toEqual({ state: "processing" });
    expect(one("SELECT status FROM pg_ledger")?.status).toBe("DONE");
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("paid");
  });
  it("recovers a crash after evidence storage using the ordinary durable worker", async () => {
    const f = fixture();
    db().exec(
      "CREATE TRIGGER synthetic_crash BEFORE UPDATE OF payment_status ON orders WHEN NEW.payment_status='paid' BEGIN SELECT RAISE(ABORT,'synthetic'); END;",
    );
    try {
      await expect(
        f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
      ).rejects.toThrow();
    } finally {
      db().exec("DROP TRIGGER synthetic_crash");
    }
    expect(one("SELECT status FROM pg_ledger")?.status).toBe("DONE");
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
    svc.workOnce();
    expect(svc.getReport(f.s, f.oid).report.chapters).toHaveLength(9);
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost full-cancel response without another cancel POST", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    svc.workOnce();
    f.set(f.canceled());
    f.gateway.cancel.mockRejectedValueOnce(Error("timeout"));
    await expect(
      f.coordinator.refund(f.admin(), f.oid, "가상 오류 환불 요청"),
    ).rejects.toThrow();
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refund_pending");
    expect(await f.coordinator.recover(f.oid)).toEqual({ state: "refunded" });
    expect(f.gateway.cancel).toHaveBeenCalledTimes(1);
    expect(one("SELECT status FROM refunds")?.status).toBe("completed");
    expect(() => svc.getReport(f.s, f.oid)).toThrow();
  });
  it("deduplicates webhook notifications and never trusts body status", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    const notice = {
      orderId: f.oid,
      eventId: "synthetic-event",
      status: "CANCELED",
      amount: 1,
    };
    expect(f.coordinator.notify(notice).queued).toBe(true);
    expect(f.coordinator.notify(notice).queued).toBe(false);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
    await f.coordinator.recoverPending();
    expect(f.gateway.lookup).toHaveBeenCalledTimes(1);
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("paid");
    expect(
      one("SELECT processed FROM toss_notifications")?.processed,
    ).toBeGreaterThan(0);
  });
  it("ignores unknown order notification without contacting the provider", () => {
    const f = fixture();
    expect(
      f.coordinator.notify({ orderId: f.oid, eventId: "unknown" }).queued,
    ).toBe(false);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
  });
  it("reconciles external full cancellation only after independent verified lookup", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    svc.workOnce();
    f.set(f.canceled());
    f.coordinator.notify({
      orderId: f.oid,
      eventId: "external-cancel",
      status: "DONE",
    });
    await f.coordinator.recoverPending();
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refunded");
    expect(one("SELECT status FROM refunds")?.status).toBe("completed");
  });
  it("does not turn a partial cancel into a full refund or grant access", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    const a = f.admin();
    f.set({ ...f.payment, status: "PARTIAL_CANCELED", balanceAmount: 21000 });
    expect(await f.coordinator.refund(a, f.oid, "가상 부분취소 검토")).toEqual({
      state: "review",
    });
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refund_pending");
    expect(one("SELECT status FROM refunds")?.status).toBe("pending");
  });
  it("only explicitly retries a cancel after recent DONE lookup and keeps the original body", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    const a = f.admin();
    f.gateway.cancel.mockRejectedValueOnce(Error("provider unavailable"));
    await expect(
      f.coordinator.refund(a, f.oid, "처음 기록한 환불 사유"),
    ).rejects.toThrow();
    await f.coordinator.recover(f.oid);
    expect(
      await f.coordinator.refund(a, f.oid, "새 사유는 자동 취소에 쓰지 않음"),
    ).toEqual({ state: "review" });
    expect(f.gateway.cancel).toHaveBeenCalledTimes(1);
    f.set(f.canceled());
    await f.coordinator.retryRefund(a, f.oid);
    expect(f.gateway.cancel).toHaveBeenCalledTimes(2);
    expect(f.gateway.cancel.mock.calls[1]).toEqual([
      f.oid,
      f.payment.paymentKey,
      "디지털콘텐츠 주문 전액 취소",
      22000,
    ]);
  });
  it("blocks mock-path cancellation and confirmation for a provider-bound order", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    expect(() => svc.refund(f.admin(), f.oid, "잘못된 경로 환불")).toThrow(
      "전용 취소",
    );
    expect(() =>
      svc.confirmPayment(f.s, f.oid, f.payment.paymentKey, 22000),
    ).toThrow("전용 승인");
    expect(() => svc.mockAuthenticate(f.s, f.oid)).toThrow("전용 승인");
  });
  it("records a full cancellation even when the app crashed before recording initial approval", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("lost approval"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow();
    f.set(f.canceled());
    expect(await f.coordinator.recover(f.oid)).toEqual({ state: "refunded" });
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refunded");
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(0);
    expect(
      one("SELECT count(*) n FROM events WHERE event='payment_confirmed'")?.n,
    ).toBe(1);
  });
  it("does not repeat approval automatically when lookup shows IN_PROGRESS", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("request not sent"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow();
    f.set({ ...f.payment, status: "IN_PROGRESS", approvedAt: null });
    expect(await f.coordinator.recover(f.oid)).toEqual({ state: "review" });
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
    f.gateway.lookup.mockImplementationOnce(async () => ({
      ...f.payment,
      status: "IN_PROGRESS",
      approvedAt: null,
    }));
    f.set(f.payment);
    expect(await f.coordinator.retryApproval(f.s, f.oid)).toEqual({
      state: "verified",
    });
    expect(f.gateway.confirm).toHaveBeenCalledTimes(2);
  });
  it("does not issue approval retry if fresh lookup shows payment already DONE", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("lost response"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow();
    f.set({ ...f.payment, status: "IN_PROGRESS", approvedAt: null });
    await f.coordinator.recover(f.oid);
    f.set(f.payment);
    await f.coordinator.retryApproval(f.s, f.oid);
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
  });
  it("retains a notification received while another lookup is in flight", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    f.coordinator.notify({ orderId: f.oid, eventId: "before" });
    let release!: (p: VerifiedPayment) => void;
    f.gateway.lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.coordinator.recover(f.oid);
    f.coordinator.notify({ orderId: f.oid, eventId: "during" });
    release(f.payment);
    await first;
    expect(one("SELECT needs_check FROM toss_attempts")?.needs_check).toBe(1);
    expect(
      one("SELECT count(*) n FROM toss_notifications WHERE processed IS NULL")
        ?.n,
    ).toBe(1);
    f.set(f.canceled());
    await f.coordinator.recoverPending();
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refunded");
  });
  it("backs off automatic recovery rather than immediately hammering an unavailable gateway", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("429"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow();
    expect(await f.coordinator.recoverPending()).toEqual([]);
    expect(f.gateway.lookup).not.toHaveBeenCalled();
    run("UPDATE toss_attempts SET next_check=0");
    await f.coordinator.recoverPending();
    expect(f.gateway.lookup).toHaveBeenCalledTimes(1);
  });
  it("includes the provider refund reason in offline DATA_KEY rotation", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    f.gateway.cancel.mockRejectedValueOnce(Error("timeout"));
    await expect(
      f.coordinator.refund(f.admin(), f.oid, "가상 결제사 환불 검토 사유"),
    ).rejects.toThrow();
    const root = mkdtempSync("var/toss-rotation-"),
      next = Buffer.alloc(32, 5),
      target = root + "/next.sqlite";
    try {
      await rotateDataKey(path, target, config().key, next, []);
      const copy = new DatabaseSync(target, { readOnly: true });
      try {
        expect(
          decryptJson(
            copy
              .prepare(
                "SELECT refund_reason_enc FROM toss_attempts WHERE order_id=?",
              )
              .get(f.oid)!.refund_reason_enc as string,
            next,
          ),
        ).toBe("가상 결제사 환불 검토 사유");
      } finally {
        copy.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects reusing a bound payment key for another owned order", async () => {
    const first = fixture();
    await first.coordinator.confirm(
      first.s,
      first.oid,
      first.payment.paymentKey,
      22000,
    );
    const second = fixture();
    await expect(
      second.coordinator.confirm(
        second.s,
        second.oid,
        second.payment.paymentKey,
        22000,
      ),
    ).rejects.toThrow();
    expect(second.gateway.confirm).not.toHaveBeenCalled();
    expect(svc.ownOrder(second.s, second.oid).payment_status).toBe("pending");
  });
  it("runs the actual HTTP contract, response parser and DB coordinator together without network", async () => {
    const f = fixture();
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        Response.json(
          String(url).endsWith("/cancel") ? f.canceled() : f.payment,
        ),
      );
    const coordinator = new TossOrderCoordinator(
      new TossTestContract(
        "test_sk_synthetic",
        createTossTestTransport({ enabled: true, fetch: send }),
      ),
      "synthetic-mid",
    );
    expect(
      await coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).toEqual({ state: "verified" });
    expect(
      await coordinator.refund(f.admin(), f.oid, "전체 계약 연결 모의 환불"),
    ).toEqual({ state: "refunded" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]?.headers).toMatchObject({
      "Idempotency-Key": "confirm-" + f.oid,
    });
    expect(send.mock.calls[1][1]?.headers).toMatchObject({
      "Idempotency-Key": "cancel-" + f.oid,
    });
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refunded");
  });
  it("does not approve a previously deleted pending order", async () => {
    const f = fixture(),
      ticket = svc.ticket(f.s, {
        orderId: f.oid,
        category: "privacy",
        message: "가상 개인정보 삭제",
      });
    svc.deleteContent(f.admin(), f.oid, ticket, "본인 확인 후 삭제 처리");
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow("삭제된 주문");
    expect(f.gateway.confirm).not.toHaveBeenCalled();
  });
  it("retains payment evidence but never recreates data deleted during an in-flight approval", async () => {
    const f = fixture();
    let release!: (p: VerifiedPayment) => void;
    f.gateway.confirm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = f.coordinator.confirm(
      f.s,
      f.oid,
      f.payment.paymentKey,
      22000,
    );
    const ticket = svc.ticket(f.s, {
      orderId: f.oid,
      category: "privacy",
      message: "가상 개인정보 삭제",
    });
    svc.deleteContent(f.admin(), f.oid, ticket, "결제 도중 삭제 요청 확인");
    release(f.payment);
    await first;
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("paid");
    expect(svc.ownOrder(f.s, f.oid).fulfillment).toBe("failed");
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(0);
    expect(svc.workOnce()).toBe(false);
    expect(
      open(one("SELECT input_enc FROM readings WHERE id=?", f.rid)!.input_enc),
    ).toBeNull();
  });
  it("does not count a recent claim as a recent successful provider check", async () => {
    const f = fixture();
    await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000);
    const a = f.admin();
    f.gateway.cancel.mockRejectedValueOnce(Error("timeout"));
    await expect(
      f.coordinator.refund(a, f.oid, "인증 시각 구분 시험"),
    ).rejects.toThrow();
    await f.coordinator.recover(f.oid);
    run(
      "UPDATE toss_attempts SET checked_at=?,updated=?",
      Date.now() - 6 * 60000,
      Date.now(),
    );
    await expect(f.coordinator.retryRefund(a, f.oid)).rejects.toThrow(
      "최근 결제 조회",
    );
    expect(f.gateway.cancel).toHaveBeenCalledTimes(1);
  });
  it("stops automatic provider retries after eight consecutive failures without losing the order", async () => {
    const f = fixture();
    f.gateway.confirm.mockRejectedValueOnce(Error("unavailable"));
    await expect(
      f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow();
    f.gateway.lookup.mockRejectedValue(Error("unavailable"));
    for (let n = 1; n < 8; n++)
      await expect(f.coordinator.recover(f.oid)).rejects.toThrow();
    expect(
      one("SELECT state,needs_check,failures FROM toss_attempts"),
    ).toMatchObject({ state: "review", needs_check: 0, failures: 8 });
    expect(await f.coordinator.recoverPending()).toEqual([]);
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
  });
  it("keeps the default external transport blocked", async () => {
    const f = fixture(),
      blocked = new TossOrderCoordinator(
        new TossTestContract("test_sk_synthetic"),
        "synthetic-mid",
      );
    await expect(
      blocked.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
    ).rejects.toThrow("확인 중");
    expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
  });
});

it("provider recovery and cancellation use the original legacy price after a product price change", async () => {
  const f = fixture(33000);
  await f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 33000);
  f.set(f.canceled());
  await f.coordinator.refund(f.admin(), f.oid, "과거 주문 전액 취소");
  expect(f.gateway.cancel.mock.calls[0]).toEqual([
    f.oid,
    f.payment.paymentKey,
    "디지털콘텐츠 주문 전액 취소",
    33000,
  ]);
  expect(svc.ownOrder(f.s, f.oid)).toMatchObject({
    amount: 33000,
    payment_status: "refunded",
  });
  expect(
    one("SELECT amount FROM refunds WHERE order_id=?", f.oid)?.amount,
  ).toBe(33000);
});
it("the old product price cannot be used to approve a current-price order", async () => {
  const f = fixture();
  await expect(
    f.coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 33000),
  ).rejects.toThrow("주문금액");
  expect(f.gateway.confirm).not.toHaveBeenCalled();
});

it("recovers a widget approval with a lost acknowledgement by its stored payment key, then cancels fully", async () => {
  const f = fixture();
  const send = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(Error("lost acknowledgement"))
    .mockResolvedValueOnce(Response.json(f.payment))
    .mockResolvedValueOnce(Response.json(f.canceled()));
  const coordinator = new TossOrderCoordinator(
    new TossTestContract(
      "test_gsk_fixture",
      createTossTestTransport({ enabled: true, fetch: send }),
    ),
    "synthetic-mid",
  );
  await expect(
    coordinator.confirm(f.s, f.oid, f.payment.paymentKey, 22000),
  ).rejects.toThrow();
  expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("pending");
  expect((await coordinator.recover(f.oid)).state).toBe("verified");
  expect(send.mock.calls[1][0]).toBe(
    "https://api.tosspayments.com/v1/payments/" +
      encodeURIComponent(f.payment.paymentKey),
  );
  expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("paid");
  expect(
    (await coordinator.refund(f.admin(), f.oid, "가상 주문 전액 취소 확인"))
      .state,
  ).toBe("refunded");
  expect(svc.ownOrder(f.s, f.oid).payment_status).toBe("refunded");
  expect(send.mock.calls.map(([, init]) => init?.method)).toEqual([
    "POST",
    "GET",
    "POST",
  ]);
});
