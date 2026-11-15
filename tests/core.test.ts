import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rotateDataKey } from "../lib/key-rotation";
import { decryptJson } from "../lib/crypto";
import {
  requestEmailChange,
  localEmailChangeCode,
  confirmEmailChange,
} from "../lib/email-change";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { calculate, tenGod, type Birth } from "../lib/astrology";
import { config } from "../lib/config";
import { db, all, one, run, closeDb } from "../lib/db";
import { hash, open, seal, totp, verifyTotp } from "../lib/security";
import { generate, preview, validateReport } from "../lib/interpretation";
import * as svc from "../lib/service";
import {
  loginAdmin,
  requireRecentAdmin,
  revokeAdminSessions,
} from "../lib/admin-auth";
import { operationalHealth } from "../lib/operations";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
import { encodeDeletions, decodeDeletions } from "../lib/deletion-manifest";
import { reportPdf } from "../lib/pdf";
const path = "./var/core-test.sqlite";
process.env.APP_MODE = "local";
process.env.EXTERNAL_EFFECTS = "disabled";
process.env.DATA_KEY = "b".repeat(64);
process.env.AUTH_SECRET = "test-secret-".repeat(5);
process.env.ADMIN_PASSWORD = "test-admin-".repeat(5);
process.env.ADMIN_TOTP_SECRET = "ab".repeat(20);
process.env.DATABASE_PATH = path;
const birth: Birth = {
  name: "테스트",
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
  rmSync(path, { force: true });
  db();
});
beforeEach(() => {
  db().exec(
    "DELETE FROM session_auth;DELETE FROM email_changes;DELETE FROM admin_auth;DELETE FROM admin_totp_replay;DELETE FROM deletion_tombstones;DELETE FROM worker_heartbeat;DELETE FROM refunds;DELETE FROM reports;DELETE FROM jobs;DELETE FROM orders;DELETE FROM readings;DELETE FROM pg_ledger;DELETE FROM tickets;DELETE FROM outbox;DELETE FROM challenges;DELETE FROM sessions;DELETE FROM events;DELETE FROM audit;DELETE FROM rate_limits;",
  );
});
afterAll(() => {
  closeDb();
  for (const x of ["", "-wal", "-shm"]) rmSync(path + x, { force: true });
});
function verified(email = "tester@example.invalid") {
  const { session } = svc.newSession();
  const cid = svc.requestOtp(session, email);
  const code = svc.localOtp(session, cid).code;
  svc.verifyOtp(session, cid, code);
  return one<svc.Session>("SELECT * FROM sessions WHERE id=?", session.id)!;
}
function order() {
  const s = verified(),
    rid = svc.makeReading(s, birth),
    oid = svc.createOrder(s, rid, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    });
  return { s, rid, oid };
}
function paid() {
  const o = order(),
    key = svc.mockAuthenticate(o.s, o.oid);
  svc.confirmPayment(o.s, o.oid, key, 22000);
  return { ...o, key };
}
function admin() {
  const s = verified("admin@example.invalid");
  run("UPDATE sessions SET role='operations' WHERE id=?", s.id);
  run("INSERT INTO admin_auth VALUES(?,?)", s.id, Date.now());
  return one<svc.Session>("SELECT * FROM sessions WHERE id=?", s.id)!;
}
describe("input and calculation boundaries", () => {
  it.each(["2023-02-29", "2000-13-01", "1995-04-31"])(
    "rejects invalid solar %s",
    (date) => expect(() => calculate({ ...birth, date })).toThrow(),
  );
  it("rejects leap flag for solar", () =>
    expect(() => calculate({ ...birth, leap: true })).toThrow());
  it("rejects nonexistent lunar leap month", () =>
    expect(() =>
      calculate({
        ...birth,
        date: "2024-02-01",
        calendar: "lunar",
        leap: true,
      }),
    ).toThrow());
  it("rejects under14 buyer and subject separately", () => {
    expect(() => calculate({ ...birth, age: "under14" })).toThrow();
    const s = verified();
    expect(() =>
      svc.makeReading(s, { ...birth, date: "2020-01-01" }),
    ).toThrow();
  });
  it("rejects unsupported overseas and historical timezone", () => {
    expect(() => calculate({ ...birth, place: "US" })).toThrow();
    expect(() => calculate({ ...birth, date: "1988-01-01" })).toThrow();
  });
  it("does not invent hour or luck when time unknown", () => {
    const c = calculate({ ...birth, time: null });
    expect(c.pillars[3]).toBeNull();
    expect(c.cycles).toEqual([]);
    expect(c.direction).toBeNull();
    expect(c.notes.join("")).toContain("미상");
  });
  it("does not save readings or conversion events for ambiguous term inputs", () => {
    const s = verified();
    for (const time of [null, "16:13"]) {
      expect(() =>
        svc.makeReading(s, { ...birth, date: "1995-02-04", time }),
      ).toThrow("절기가");
    }
    expect(one("SELECT count(*) n FROM readings")?.n).toBe(0);
    expect(
      one("SELECT count(*) n FROM events WHERE event='preview_ready'")?.n,
    ).toBe(0);
  });
  it("does not infer calculation sex", () =>
    expect(calculate({ ...birth, sex: "unspecified" }).cycles).toEqual([]));
  it("calculates hidden stems, relations and ten gods", () => {
    const c = calculate(birth);
    expect(c.hidden).toHaveLength(4);
    expect(c.hidden.flat().length).toBeGreaterThan(3);
    expect(c.tenGods[2]).toBe("비견");
    expect(tenGod("甲", "己")).toBe("정재");
    expect(tenGod("甲", "庚")).toBe("편관");
  });
  it.each([
    ["2024-01-01", "2024-02-10", false],
    ["2023-02-01", "2023-03-22", true],
    ["2022-01-01", "2022-02-01", false],
  ])("known Korean calendar date fixture %s", (date, solarDate, leap) =>
    expect(
      calculate({ ...birth, date, calendar: "lunar", leap }).solarDate,
    ).toBe(solarDate),
  );
  it("uses 00:00 day boundary rather than 23:00", () => {
    const a = calculate({ ...birth, date: "2000-01-07", time: "23:30" }),
      b = calculate({ ...birth, date: "2000-01-08", time: "00:30" });
    expect(a.day).toBe("甲");
    expect(a.pillars[2]).toBe("甲子");
    expect(b.pillars[2]).toBe("乙丑");
  });
  it("changes year/month around KST lichun not CST", () => {
    const a = calculate({ ...birth, date: "2024-02-04", time: "17:00" }),
      b = calculate({ ...birth, date: "2024-02-04", time: "18:00" });
    expect(a.pillars.slice(0, 2)).toEqual(["癸卯", "乙丑"]);
    expect(b.pillars.slice(0, 2)).toEqual(["甲辰", "丙寅"]);
  });
  it("immutable deterministic chart/preview across reruns", () => {
    expect(calculate(birth)).toEqual(calculate(birth));
    expect(preview(calculate(birth))).toEqual(preview(calculate(birth)));
  });
  it("different day produces distinct claim references and preview", () => {
    const a = calculate(birth),
      b = calculate({ ...birth, date: "1995-05-16" });
    expect(a.claims[0].id).not.toBe(b.claims[0].id);
    expect(preview(a).intro).not.toBe(preview(b).intro);
  });
  // Independent proleptic Gregorian JDN arithmetic; reference epoch JDN+49 => 甲子.
  const stems = "甲乙丙丁戊己庚辛壬癸",
    branches = "子丑寅卯辰巳午未申酉戌亥";
  for (let n = 0; n < 120; n++) {
    const year = 1989 + (n % 30),
      month = 1 + Math.floor(n / 10),
      day = 1 + ((n * 11) % 27),
      date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    it("independent JDN day fixture " + date, () => {
      const a = Math.floor((14 - month) / 12),
        y = year + 4800 - a,
        m = month + 12 * a - 3,
        jdn =
          day +
          Math.floor((153 * m + 2) / 5) +
          365 * y +
          Math.floor(y / 4) -
          Math.floor(y / 100) +
          Math.floor(y / 400) -
          32045,
        k = (jdn + 49) % 60;
      expect(calculate({ ...birth, date, time: "12:00" }).pillars[2]).toBe(
        stems[k % 10] + branches[k % 12],
      );
    });
  }
});
describe("privacy and authentication", () => {
  it("encrypts randomized authenticated payload and detects tampering", () => {
    const a = seal(birth),
      b = seal(birth);
    expect(a).not.toBe(b);
    expect(open(a)).toEqual(birth);
    const c = Buffer.from(a, "base64");
    c[c.length - 1] ^= 1;
    expect(() => open(c.toString("base64"))).toThrow();
  });
  it("hashed session and one use OTP with email ownership", () => {
    const { token, session } = svc.newSession();
    expect(session.id).not.toBe(token);
    const cid = svc.requestOtp(session, "T@example.invalid");
    svc.verifyOtp(session, cid, svc.localOtp(session, cid).code);
    expect(() => svc.verifyOtp(session, cid, "000000")).toThrow();
    expect(
      one("SELECT * FROM sessions WHERE id=?", session.id)?.email_hash,
    ).toBe(hash("t@example.invalid"));
  });
  it("limits OTP guessing to 5 and persists attempts after failure", () => {
    const { session } = svc.newSession(),
      cid = svc.requestOtp(session, "guess@example.invalid"),
      correct = svc.localOtp(session, cid).code,
      wrong = correct === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect(() => svc.verifyOtp(session, cid, wrong)).toThrow();
    expect(() => svc.verifyOtp(session, cid, correct)).toThrow();
    expect(
      one("SELECT attempts FROM challenges WHERE id=?", cid)?.attempts,
    ).toBe(5);
  });
  it("rejects expired OTP", () => {
    const { session } = svc.newSession(),
      cid = svc.requestOtp(session, "expire@example.invalid"),
      code = svc.localOtp(session, cid).code;
    run("UPDATE challenges SET expires=0 WHERE id=?", cid);
    expect(() => svc.verifyOtp(session, cid, code)).toThrow();
  });
  it("local inbox scoped to requesting session", () => {
    const { session: a } = svc.newSession(),
      { session: b } = svc.newSession(),
      cid = svc.requestOtp(a, "t@example.invalid");
    expect(() => svc.localOtp(b, cid)).toThrow();
  });
  it("limits preview abuse", () => {
    const s = verified();
    for (let i = 0; i < 20; i++) svc.makeReading(s, birth);
    for (let i = 0; i < 80; i++)
      expect(() => svc.makeReading(s, birth)).toThrow();
  });
  it("rejects stored XSS rather than reflecting it", () => {
    const s = verified();
    expect(() =>
      svc.makeReading(s, { ...birth, name: "<img onerror=alert(1)>" }),
    ).toThrow();
  });
  it("checks session expiry", () => {
    const { token } = svc.newSession();
    run("UPDATE sessions SET expires=0");
    expect(svc.sessionFor(token)).toBeUndefined();
  });
  it("validates TOTP window", () => {
    expect(verifyTotp(totp(process.env.ADMIN_TOTP_SECRET!))).toBe(true);
    expect(verifyTotp("not-code")).toBe(false);
  });
  it("blocks external modes even with configuration present", () => {
    process.env.EXTERNAL_EFFECTS = "enabled";
    expect(() => config()).toThrow("EXTERNAL_EFFECTS_BLOCKED");
    process.env.EXTERNAL_EFFECTS = "disabled";
  });
});
describe("orders, mock PG and durable recovery", () => {
  it("minimal free input defaults to Korea without assuming adult buyer", () => {
    const s = verified();
    const { age, place, ...input } = birth;
    const rid = svc.makeReading(s, input),
      r = svc.readingFor(s, rid);
    expect(r.input.place).toBe("KR");
    expect(r.input.age).toBe("unconfirmed");
    expect(r.age_category).toBe("unconfirmed");
    expect(r.purchaseEligible).toBe(true);
  });
  it("requires separate adult confirmation at checkout and records its source", () => {
    const s = verified();
    const { age, ...input } = birth;
    const rid = svc.makeReading(s, input),
      consent = {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
      };
    expect(() => svc.createOrder(s, rid, consent)).toThrow();
    expect(() =>
      svc.createOrder(s, rid, { ...consent, buyerAdult: false }),
    ).toThrow();
    const oid = svc.createOrder(s, rid, { ...consent, buyerAdult: true });
    const saved = open(svc.ownOrder(s, oid).consent_enc);
    expect(saved.buyerAdult).toBe(true);
    expect(saved.ageEvidence).toBe("checkout-self-declaration");
    expect(svc.readingFor(s, rid).input.age).toBe("unconfirmed");
  });
  it("does not allow an under19 self-reading to bypass purchase gate with adult checkbox", () => {
    const s = verified();
    const { age, ...input } = birth;
    const rid = svc.makeReading(s, { ...input, date: "2010-05-15" });
    expect(svc.readingFor(s, rid).purchaseEligible).toBe(false);
    expect(() =>
      svc.createOrder(s, rid, {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
      }),
    ).toThrow("14~18");
  });

  it("server blocks 14-18 paid orders despite guardian flag", () => {
    const s = verified(),
      rid = svc.makeReading(s, { ...birth, age: "14-18" });
    expect(() =>
      svc.createOrder(s, rid, {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
        guardianConsent: true,
      }),
    ).toThrow("14~18");
  });
  it("requires verified email and separate mandatory consents", () => {
    const { session } = svc.newSession(),
      rid = svc.makeReading(session, birth);
    expect(() => svc.createOrder(session, rid, {})).toThrow();
    const s = verified();
    const r = svc.makeReading(s, birth);
    expect(() => svc.createOrder(s, r, { terms: true })).toThrow();
  });
  it("one active order for double click", () => {
    const { s, rid, oid } = order();
    expect(
      svc.createOrder(s, rid, {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
      }),
    ).toBe(oid);
    expect(one("SELECT count(*) n FROM orders")?.n).toBe(1);
  });
  it("rejects altered amount and forged key", () => {
    const { s, oid } = order(),
      key = svc.mockAuthenticate(s, oid);
    expect(() => svc.confirmPayment(s, oid, key, 1)).toThrow();
    expect(() => svc.confirmPayment(s, oid, "forged", 22000)).toThrow();
    expect(svc.ownOrder(s, oid).payment_status).toBe("pending");
  });
  it("rejects another customer order/report/PDF data", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const other = verified("stranger@example.invalid");
    expect(() => svc.ownOrder(other, oid)).toThrow();
    expect(() => svc.getReport(other, oid)).toThrow();
    expect(svc.getReport(s, oid).name).toBe(birth.name);
  });
  it("no paid report before payment", () => {
    const { s, oid } = order();
    expect(() => svc.getReport(s, oid)).toThrow();
    expect(svc.workOnce()).toBe(false);
  });
  it("PG decline does not mark order paid", () => {
    const { s, oid } = order();
    expect(() => svc.mockAuthenticate(s, oid, "decline")).toThrow();
    expect(svc.ownOrder(s, oid).payment_status).toBe("pending");
  });
  it("duplicate confirmations and 5 webhook reconciliations create one job/report/event", () => {
    const { s, oid, key } = paid();
    for (let i = 0; i < 5; i++) {
      svc.confirmPayment(s, oid, key, 22000);
      svc.reconcile();
    }
    svc.workOnce();
    svc.workOnce();
    expect(one("SELECT count(*) n FROM jobs")?.n).toBe(1);
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(1);
    expect(
      one("SELECT count(*) n FROM events WHERE event='payment_confirmed'")?.n,
    ).toBe(1);
  });
  it("recovers PG success after browser close without confirmation", () => {
    const { s, oid } = order();
    svc.mockAuthenticate(s, oid, "close");
    expect(svc.ownOrder(s, oid).payment_status).toBe("pending");
    svc.workOnce();
    expect(svc.getReport(s, oid).order.payment).toBe("paid");
  });
  it("recovers approval with simulated DB failure and process reconnection", () => {
    const { s, oid } = order(),
      key = svc.mockAuthenticate(s, oid);
    expect(() => svc.confirmPayment(s, oid, key, 22000, true)).toThrow();
    closeDb();
    db();
    svc.workOnce();
    expect(svc.getReport(s, oid).order.fulfillment).toBe("ready");
  });
  it("AI failures preserve payment and retry then alert", () => {
    const { s, oid } = paid();
    for (let i = 0; i < 4; i++) {
      svc.workOnce(true);
      run("UPDATE jobs SET scheduled=0");
    }
    expect(svc.ownOrder(s, oid).payment_status).toBe("paid");
    expect(svc.ownOrder(s, oid).fulfillment).toBe("failed");
    expect(
      one("SELECT * FROM audit WHERE action='generation_failed_alert'"),
    ).toBeTruthy();
    svc.adminRetry(admin(), oid);
    svc.workOnce();
    expect(svc.getReport(s, oid).order.fulfillment).toBe("ready");
  });
  it("reclaims crashed worker lease", () => {
    const { s, oid } = paid();
    run("UPDATE jobs SET state='running',lease_until=0");
    svc.workOnce();
    expect(svc.getReport(s, oid).order.fulfillment).toBe("ready");
  });
  it("returns exact same report after new browser/email recovery", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const original = svc.getReport(s, oid).report,
      newSession = verified();
    expect(svc.listOrders(newSession)[0].id).toBe(oid);
    expect(svc.getReport(newSession, oid).report).toEqual(original);
  });
  it("enforces server one year expiry", () => {
    const { s, oid } = paid();
    svc.workOnce();
    run("UPDATE orders SET expires=0 WHERE id=?", oid);
    expect(() => svc.getReport(s, oid)).toThrow("종료");
    svc.purgeExpired();
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
  });
});
describe("report schema and Korean PDF", () => {
  it("rejects unknown facts, changed chart and missing chapter", () => {
    const c = calculate(birth),
      r = generate(c);
    const a = structuredClone(r);
    a.chapters[0].claimIds = ["MADE_UP"];
    expect(() => validateReport(a, c)).toThrow();
    const b = structuredClone(r);
    b.chart.day = "癸";
    expect(() => validateReport(b, c)).toThrow();
    expect(() =>
      validateReport({ ...r, chapters: r.chapters.slice(1) }, c),
    ).toThrow();
  });
  it("outputs nine personalized chapters with zero external cost", () => {
    const c = calculate(birth),
      r = generate(c);
    expect(r.chapters).toHaveLength(9);
    expect(r.chapters[7].text).toContain("12월");
    expect(r.usage.costKrw).toBe(0);
    expect(r.provider).toBe("local-rule-mock");
  });
  it("generates actual PDF with embedded Korean font from stored report", async () => {
    const { s, oid } = paid();
    svc.workOnce();
    const data = svc.getReport(s, oid),
      pdf = await reportPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20000);
    expect(pdf.toString("latin1")).toContain("/FontFile2");
    expect(pdf.toString("latin1")).toContain("/ToUnicode");
    expect(svc.getReport(s, oid).report).toEqual(data.report);
  }, 20000);
  it("mail failure/absence does not remove report access", () => {
    const { s, oid } = paid();
    svc.workOnce();
    run("DELETE FROM outbox");
    expect(svc.getReport(s, oid).report.chapters).toHaveLength(9);
    svc.resend(s, oid);
    expect(one("SELECT count(*) n FROM outbox")?.n).toBe(1);
  });
});
describe("admin refunds, correction and support", () => {
  it("prevents customer admin operation", () => {
    const { s, oid } = paid();
    expect(() => svc.refund(s, oid, "test refund")).toThrow();
    expect(() => svc.adminOverview(s)).toThrow();
  });
  it("restricts support role refund and report text", () => {
    const a = admin();
    run("UPDATE sessions SET role='support' WHERE id=?", a.id);
    const support = one<svc.Session>(
      "SELECT * FROM sessions WHERE id=?",
      a.id,
    )!;
    const { oid } = paid();
    expect(() => svc.refund(support, oid, "duplicate")).toThrow();
    expect(svc.adminOverview(support).orders[0]).not.toHaveProperty("report");
  });
  it("failed cancellation remains pending, retry completes once and revokes access", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const a = admin();
    expect(() => svc.refund(a, oid, "중복 결제 확인", true)).toThrow();
    expect(svc.ownOrder(s, oid).payment_status).toBe("refund_pending");
    expect(one("SELECT status FROM refunds")?.status).toBe("error");
    svc.refund(a, oid, "중복 결제 확인");
    const pg = one("SELECT * FROM pg_ledger WHERE order_id=?", oid);
    svc.refund(a, oid, "중복 재요청");
    expect(
      one("SELECT cancel_id FROM pg_ledger WHERE order_id=?", oid)?.cancel_id,
    ).toBe(pg?.cancel_id);
    expect(one("SELECT count(*) n FROM refunds")?.n).toBe(1);
    expect(() => svc.getReport(s, oid)).toThrow();
  });
  it("reconciles PG cancellation after app crash", () => {
    const { s, oid } = paid();
    const a = admin();
    expect(() => svc.refund(a, oid, "오류 복구 시험", true)).toThrow();
    run(
      "UPDATE pg_ledger SET status='CANCELED',cancel_id='mock-cancel' WHERE order_id=?",
      oid,
    );
    svc.reconcileRefunds();
    expect(svc.ownOrder(s, oid).payment_status).toBe("refunded");
  });
  it("correction retains old report version and only permits one benefit", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const a = admin(),
      old = svc.getReport(s, oid).report;
    svc.correctBirth(
      a,
      oid,
      { ...birth, date: "1995-05-16" },
      "인증된 고객의 날짜 정정 요청",
    );
    svc.workOnce();
    expect(svc.getReport(s, oid).order.version).toBe(2);
    expect(svc.getReport(s, oid).report.chart.day).not.toBe(old.chart.day);
    expect(all("SELECT * FROM reports WHERE order_id=?", oid)).toHaveLength(2);
    expect(() =>
      svc.correctBirth(a, oid, birth, "두 번째 수정 요청"),
    ).toThrow();
  });
  it("customer inquiry and admin reply are persisted", () => {
    const { s, oid } = paid(),
      tid = svc.ticket(s, {
        orderId: oid,
        category: "guardian",
        message: "법정대리인 계약 취소 검토 요청",
      });
    svc.answerTicket(
      admin(),
      tid,
      "요청을 접수했습니다. 계약 증빙을 별도로 검토하겠습니다.",
    );
    expect(svc.getTickets(s)[0].status).toBe("answered");
    expect(svc.getTickets(s)[0].answer).toContain("증빙");
  });
  it("analytics contains no raw PII or chart", () => {
    const { oid } = paid();
    svc.workOnce();
    const text = JSON.stringify(all("SELECT * FROM events"));
    expect(text).not.toContain("tester@");
    expect(text).not.toContain(birth.date);
    expect(text).not.toContain(birth.name);
    expect(text).toContain(oid);
  });
  it("SQLite backup restores encrypted report and payment state", async () => {
    const { s, oid } = paid();
    svc.workOnce();
    const { DatabaseSync } = await import("node:sqlite");
    const { createEncryptedBackup, restoreEncryptedBackup } =
      await import("../lib/backup");
    const target = "./var/test-backup.sqlite",
      archive = "./var/test-backup.gsb";
    rmSync(target, { force: true });
    rmSync(archive, { force: true });
    const { config } = await import("../lib/config");
    await createEncryptedBackup(db(), archive, config().key);
    restoreEncryptedBackup(archive, target, config().key);
    const copy = new DatabaseSync(target);
    expect(
      copy.prepare("SELECT payment_status FROM orders WHERE id=?").get(oid),
    ).toMatchObject({ payment_status: "paid" });
    const row = copy
      .prepare("SELECT payload FROM reports WHERE order_id=?")
      .get(oid) as any;
    expect(open(row.payload)).toEqual(svc.getReport(s, oid).report);
    copy.close();
    rmSync(target, { force: true });
    rmSync(archive, { force: true });
  });
  it("privacy deletion wipes all versions and cannot be recreated by worker", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const a = admin();
    svc.correctBirth(
      a,
      oid,
      { ...birth, date: "1995-05-16" },
      "인증된 고객 정정 요청 확인",
    );
    const tid = svc.ticket(s, {
      orderId: oid,
      category: "privacy",
      message: "모든 운명서와 출생정보 삭제 요청",
    });
    svc.deleteContent(a, oid, tid, "인증된 고객의 삭제 의사와 주문 대조");
    expect(svc.workOnce()).toBe(false);
    expect(() => svc.getReport(s, oid)).toThrow();
    expect(one("SELECT count(*) n FROM reports WHERE order_id=?", oid)?.n).toBe(
      0,
    );
    for (const r of all(
      "SELECT reading_id FROM reading_history WHERE order_id=?",
      oid,
    ))
      expect(
        open(
          one("SELECT input_enc FROM readings WHERE id=?", r.reading_id)!
            .input_enc,
        ),
      ).toBeNull();
    expect(svc.ownOrder(s, oid).payment_status).toBe("paid");
  });
  it("privacy delete cannot use another buyer ticket", () => {
    const { oid } = paid(),
      other = verified("different@example.invalid"),
      tid = svc.ticket(other, {
        category: "privacy",
        message: "내 개인정보 삭제 요청합니다.",
      });
    expect(() =>
      svc.deleteContent(admin(), oid, tid, "대상 불일치 삭제 시도"),
    ).toThrow();
  });
  it("refund re-click returns original order rather than duplicate rebuy on same snapshot", () => {
    const { s, rid, oid } = paid();
    svc.refund(admin(), oid, "본인 모의 환불 요청");
    expect(
      svc.createOrder(s, rid, {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
      }),
    ).toBe(oid);
    expect(one("SELECT count(*) n FROM orders")?.n).toBe(1);
  });
});

describe("security and operational hardening", () => {
  it("rotates administrator session and preserves owned reading links", () => {
    const old = svc.newSession();
    const rid = svc.makeReading(old.session, birth);
    const token = loginAdmin(
      old.session,
      process.env.ADMIN_PASSWORD,
      totp(process.env.ADMIN_TOTP_SECRET!),
    );
    expect(svc.sessionFor(old.token)).toBeUndefined();
    const elevated = svc.sessionFor(token)!;
    expect(elevated.role).toBe("operations");
    expect(svc.readingFor(elevated, rid).input).toEqual(birth);
    expect(() => requireRecentAdmin(elevated)).not.toThrow();
  });
  it("rejects global TOTP reuse without elevating the second session", () => {
    const a = svc.newSession(),
      b = svc.newSession(),
      code = totp(process.env.ADMIN_TOTP_SECRET!);
    loginAdmin(a.session, process.env.ADMIN_PASSWORD, code);
    expect(() =>
      loginAdmin(b.session, process.env.ADMIN_PASSWORD, code),
    ).toThrow("사용된");
    expect(svc.sessionFor(b.token)?.role).toBe("customer");
  });
  it("failed password does not consume a valid second factor", () => {
    const s = svc.newSession(),
      code = totp(process.env.ADMIN_TOTP_SECRET!);
    expect(() => loginAdmin(s.session, "wrong-password", code)).toThrow(
      "인증에 실패",
    );
    expect(() =>
      loginAdmin(s.session, process.env.ADMIN_PASSWORD, code),
    ).not.toThrow();
  });
  it("requires recent MFA for financial operations and checks live role revocation", () => {
    const a = admin(),
      { oid } = paid();
    run(
      "UPDATE admin_auth SET verified_at=? WHERE session_id=?",
      Date.now() - 11 * 60000,
      a.id,
    );
    expect(() => svc.refund(a, oid, "기간 경과 인증 시험")).toThrow("다시");
    run(
      "UPDATE admin_auth SET verified_at=? WHERE session_id=?",
      Date.now(),
      a.id,
    );
    run("UPDATE sessions SET role='support' WHERE id=?", a.id);
    expect(() => svc.refund(a, oid, "권한 회수 시험")).toThrow("권한");
    expect(
      svc.ownOrder(verified("tester@example.invalid"), oid).payment_status,
    ).toBe("paid");
  });
  it("revokes all administrator sessions without ending customer sessions", () => {
    const a = admin(),
      customer = svc.newSession();
    revokeAdminSessions(a);
    expect(one("SELECT * FROM sessions WHERE id=?", a.id)).toBeUndefined();
    expect(svc.sessionFor(customer.token)).toBeDefined();
  });
  it("repairs a missing paid generation job once without charging or duplicating reports", () => {
    const { s, oid } = paid();
    run("DELETE FROM jobs WHERE order_id=?", oid);
    svc.reconcile();
    svc.reconcile();
    expect(one("SELECT count(*) n FROM jobs WHERE order_id=?", oid)?.n).toBe(1);
    svc.workOnce();
    expect(svc.getReport(s, oid).report.chapters).toHaveLength(9);
    expect(
      one("SELECT count(*) n FROM pg_ledger WHERE order_id=?", oid)?.n,
    ).toBe(1);
  });
  it("manual retry can restore missing jobs but refuses expired paid orders", () => {
    const { oid } = paid(),
      a = admin();
    run("DELETE FROM jobs WHERE order_id=?", oid);
    svc.adminRetry(a, oid);
    expect(one("SELECT state FROM jobs WHERE order_id=?", oid)?.state).toBe(
      "queued",
    );
    run("UPDATE orders SET expires=0 WHERE id=?", oid);
    expect(() => svc.adminRetry(a, oid)).toThrow("재처리 대상");
    expect(svc.workOnce()).toBe(false);
  });
  it("does not silently regenerate an already-delivered missing report", () => {
    const { oid } = paid();
    svc.workOnce();
    run("DELETE FROM reports WHERE order_id=?", oid);
    svc.reconcile();
    expect(svc.workOnce()).toBe(false);
    expect(operationalHealth().counts.missingReports).toBe(1);
  });
  it("refuses mismatched refund ledger and leaves money state pending", () => {
    const { s, oid } = paid(),
      a = admin();
    run("UPDATE pg_ledger SET amount=1 WHERE order_id=?", oid);
    expect(() => svc.refund(a, oid, "금액 대조 실패 시험")).toThrow(
      "원장 대조",
    );
    expect(svc.ownOrder(s, oid).payment_status).toBe("refund_pending");
    run(
      "UPDATE pg_ledger SET status='CANCELED',cancel_id='synthetic-cancel' WHERE order_id=?",
      oid,
    );
    svc.reconcileRefunds();
    expect(svc.ownOrder(s, oid).payment_status).toBe("refund_pending");
  });
  it("rejects minor birth correction even when age declaration says adult", () => {
    const { oid } = paid();
    expect(() =>
      svc.correctBirth(
        admin(),
        oid,
        { ...birth, date: "2010-05-15" },
        "잘못된 연령 정정 시험",
      ),
    ).toThrow("미성년");
  });
  it("applies later privacy deletions before publishing an older restored backup", async () => {
    const { s, oid } = paid();
    svc.workOnce();
    const archive = "var/privacy-before-delete.gsb",
      target = "var/privacy-restored.sqlite";
    rmSync(archive, { force: true });
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(target + suffix, { force: true });
    await createEncryptedBackup(db(), archive, config().key);
    const ticketId = svc.ticket(s, {
      orderId: oid,
      category: "privacy",
      message: "가상 개인정보 삭제 요청",
    });
    svc.deleteContent(admin(), oid, ticketId, "대상 및 본인 확인 완료");
    const rows = all(
      "SELECT order_id AS orderId,deleted_at AS deletedAt FROM deletion_tombstones",
    ) as { orderId: string; deletedAt: number }[];
    const manifest = encodeDeletions(rows, config().key);
    restoreEncryptedBackup(
      archive,
      target,
      config().key,
      decodeDeletions(manifest, config().key),
    );
    const { DatabaseSync } = await import("node:sqlite"),
      restored = new DatabaseSync(target, { readOnly: true });
    try {
      expect(
        restored
          .prepare("SELECT content_deleted FROM orders WHERE id=?")
          .get(oid)?.content_deleted,
      ).toBe(1);
      expect(
        restored
          .prepare("SELECT count(*) n FROM reports WHERE order_id=?")
          .get(oid)?.n,
      ).toBe(0);
      const row = restored
        .prepare(
          "SELECT input_enc FROM readings WHERE id=(SELECT reading_id FROM orders WHERE id=?)",
        )
        .get(oid)!;
      expect(open(row.input_enc as string)).toBeNull();
      expect(
        restored
          .prepare("SELECT payment_status FROM orders WHERE id=?")
          .get(oid)?.payment_status,
      ).toBe("paid");
    } finally {
      restored.close();
      rmSync(archive, { force: true });
      for (const suffix of ["", "-wal", "-shm"])
        rmSync(target + suffix, { force: true });
    }
  });
  it("authenticates the deletion list without revealing raw customer details", () => {
    const encoded = encodeDeletions(
      [{ orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", deletedAt: 1 }],
      config().key,
    );
    const changed = JSON.parse(encoded);
    changed.signature = "0".repeat(64);
    expect(() =>
      decodeDeletions(JSON.stringify(changed), config().key),
    ).toThrow("AUTHENTICATION");
    expect(() => decodeDeletions(encoded, Buffer.alloc(32, 7))).toThrow(
      "AUTHENTICATION",
    );
  });
});

describe("verified purchase email change, local delivery only", () => {
  it("moves only the verified order and preserves the exact stored report", () => {
    const { s, oid } = paid();
    svc.workOnce();
    const old = svc.getReport(s, oid).report;
    const tid = svc.ticket(s, {
      orderId: oid,
      category: "email",
      message: "가상 주소 정정 요청",
    });
    const change = requestEmailChange(s, oid, "corrected@example.invalid");
    const code = localEmailChangeCode(s, change).code;
    confirmEmailChange(s, change, code);
    expect(one("SELECT * FROM sessions WHERE id=?", s.id)).toBeUndefined();
    expect(() => svc.getReport(s, oid)).toThrow();
    const next = verified("corrected@example.invalid");
    expect(svc.getReport(next, oid).report).toEqual(old);
    expect(svc.getTickets(next).some((t) => t.id === tid)).toBe(true);
    expect(
      one("SELECT state FROM email_changes WHERE id=?", change)?.state,
    ).toBe("completed");
  });
  it("does not use invalidated OTP requests as proof of recent old-email authentication", () => {
    const { s, oid } = paid();
    run(
      "UPDATE session_auth SET verified_at=? WHERE session_id=?",
      Date.now() - 11 * 60000,
      s.id,
    );
    svc.requestOtp(s, "tester@example.invalid");
    svc.requestOtp(s, "tester@example.invalid");
    expect(() =>
      requestEmailChange(s, oid, "corrected@example.invalid"),
    ).toThrow("다시 인증");
  });
  it("does not reveal codes or change another customer's order", () => {
    const { s, oid } = paid(),
      other = verified("other@example.invalid");
    const cid = requestEmailChange(s, oid, "corrected@example.invalid");
    expect(() => localEmailChangeCode(other, cid)).toThrow();
    expect(() =>
      requestEmailChange(other, oid, "corrected@example.invalid"),
    ).toThrow();
    expect(() => confirmEmailChange(other, cid, "123456")).toThrow();
    expect(svc.ownOrder(s, oid).email_hash).toBe(s.email_hash);
  });
  it("counts bad codes, blocks exhausted challenges and keeps original access", () => {
    const { s, oid } = paid();
    const cid = requestEmailChange(s, oid, "corrected@example.invalid");
    const code = localEmailChangeCode(s, cid).code,
      bad = code === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++)
      expect(() => confirmEmailChange(s, cid, bad)).toThrow();
    expect(() => confirmEmailChange(s, cid, code)).toThrow();
    expect(
      one("SELECT attempts FROM email_changes WHERE id=?", cid)?.attempts,
    ).toBe(5);
    expect(svc.ownOrder(s, oid).email_hash).toBe(s.email_hash);
  });
  it("invalidates replaced and expired change challenges", () => {
    const { s, oid } = paid();
    const first = requestEmailChange(s, oid, "first@example.invalid");
    const code = localEmailChangeCode(s, first).code;
    const second = requestEmailChange(s, oid, "second@example.invalid");
    expect(() => confirmEmailChange(s, first, code)).toThrow();
    const secondCode = localEmailChangeCode(s, second).code;
    run("UPDATE email_changes SET expires=0 WHERE id=?", second);
    expect(() => confirmEmailChange(s, second, secondCode)).toThrow();
  });
});

describe("offline DATA_KEY rotation", () => {
  it("re-encrypts a new copy, preserves report/payment and revokes copied sessions", async () => {
    const { s, oid } = paid();
    svc.workOnce();
    const original = svc.getReport(s, oid).report;
    const target = "var/rotated-test.sqlite",
      newKey = Buffer.alloc(32, 9);
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(target + suffix, { force: true });
    await rotateDataKey(path, target, config().key, newKey, []);
    const { DatabaseSync } = await import("node:sqlite"),
      copy = new DatabaseSync(target, { readOnly: true });
    try {
      const report = copy
        .prepare("SELECT payload FROM reports WHERE order_id=?")
        .get(oid)!;
      expect(decryptJson(report.payload as string, newKey)).toEqual(original);
      expect(() =>
        decryptJson(report.payload as string, config().key),
      ).toThrow();
      expect(
        copy.prepare("SELECT payment_status FROM orders WHERE id=?").get(oid)
          ?.payment_status,
      ).toBe("paid");
      expect(copy.prepare("SELECT count(*) n FROM sessions").get()?.n).toBe(0);
      expect(svc.getReport(s, oid).report).toEqual(original);
    } finally {
      copy.close();
      for (const suffix of ["", "-wal", "-shm"])
        rmSync(target + suffix, { force: true });
    }
  });
  it("rejects a no-op key change before reading or overwriting any database", async () => {
    await expect(
      rotateDataKey(
        "missing.sqlite",
        "var/unused-rotation.sqlite",
        config().key,
        config().key,
        [],
      ),
    ).rejects.toThrow("KEYS_INVALID");
  });
});

describe("old-key backup recovery after a key rotation", () => {
  it("verifies the latest manifest using current key and re-encrypts the old archive before publishing", async () => {
    const { oid, s } = paid();
    svc.workOnce();
    const original = svc.getReport(s, oid).report;
    const root = mkdtempSync("var/old-key-recovery-test-");
    try {
      const archive = root + "/before.gsb",
        target = root + "/recovered.sqlite",
        manifest = root + "/current.json",
        oldFile = root + "/old.key",
        next = Buffer.alloc(32, 8);
      await createEncryptedBackup(db(), archive, config().key);
      writeFileSync(oldFile, config().key.toString("hex"), { mode: 0o600 });
      writeFileSync(manifest, encodeDeletions([], next), { mode: 0o600 });
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/restore.ts",
          archive,
          target,
          "--deletions",
          manifest,
          "--archive-key-file",
          oldFile,
        ],
        {
          env: { ...process.env, DATA_KEY: next.toString("hex") },
          encoding: "utf8",
        },
      );
      expect(output).not.toContain(next.toString("hex"));
      const { DatabaseSync } = await import("node:sqlite"),
        copy = new DatabaseSync(target, { readOnly: true });
      try {
        expect(
          decryptJson(
            copy
              .prepare("SELECT payload FROM reports WHERE order_id=?")
              .get(oid)!.payload as string,
            next,
          ),
        ).toEqual(original);
      } finally {
        copy.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it("rotates customer sessions atomically on successful email authentication", () => {
  const original = svc.newSession(),
    rid = svc.makeReading(original.session, birth);
  const challenge = svc.requestOtp(
      original.session,
      "rotation@example.invalid",
    ),
    code = svc.localOtp(original.session, challenge).code;
  const token = svc.verifyOtp(original.session, challenge, code, true)!;
  expect(svc.sessionFor(original.token)).toBeUndefined();
  const current = svc.sessionFor(token)!;
  expect(current.email_hash).toBe(hash("rotation@example.invalid"));
  expect(svc.readingFor(current, rid).input).toEqual(birth);
  expect(() => svc.verifyOtp(current, challenge, code, true)).toThrow();
});

it("new orders use 22,000 and reject the former 33,000 callback amount", () => {
  const o = order();
  expect(svc.ownOrder(o.s, o.oid).amount).toBe(22000);
  const key = svc.mockAuthenticate(o.s, o.oid);
  expect(() => svc.confirmPayment(o.s, o.oid, key, 33000)).toThrow("주문금액");
  svc.confirmPayment(o.s, o.oid, key, 22000);
  expect(svc.ownOrder(o.s, o.oid).payment_status).toBe("paid");
});
it("honors the original 33,000 on a legacy order's approval, stored report and full refund", () => {
  const o = order();
  run("UPDATE orders SET amount=33000 WHERE id=?", o.oid);
  expect(() =>
    svc.createOrder(o.s, o.rid, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    }),
  ).toThrow("판매가가 변경");
  const key = svc.mockAuthenticate(o.s, o.oid);
  svc.confirmPayment(o.s, o.oid, key, 33000);
  svc.workOnce();
  const report = svc.getReport(o.s, o.oid);
  expect(report.order.amount).toBe(33000);
  expect(svc.getReport(o.s, o.oid).report).toEqual(report.report);
  svc.refund(admin(), o.oid, "과거 주문 전액 취소");
  expect(
    one("SELECT amount,status FROM refunds WHERE order_id=?", o.oid),
  ).toMatchObject({ amount: 33000, status: "completed" });
  expect(
    one("SELECT amount,status FROM pg_ledger WHERE order_id=?", o.oid),
  ).toMatchObject({ amount: 33000, status: "CANCELED" });
});
