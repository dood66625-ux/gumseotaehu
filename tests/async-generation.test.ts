import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { closeDb, db, one, run } from "../lib/db";
import * as svc from "../lib/service";
import { generate } from "../lib/interpretation";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
const path = "./var/async-generation-test.sqlite";
process.env.APP_MODE = "local";
process.env.EXTERNAL_EFFECTS = "disabled";
process.env.DATA_KEY = "c".repeat(64);
process.env.AUTH_SECRET = "async-test-secret-".repeat(4);
process.env.ADMIN_PASSWORD = "async-test-admin-".repeat(4);
process.env.ADMIN_TOTP_SECRET = "ab".repeat(20);
process.env.DATABASE_PATH = path;
beforeAll(() => {
  rmSync(path, { force: true });
  db();
});
beforeEach(() => {
  db().exec(
    "DELETE FROM mail_queue;DELETE FROM outbox;DELETE FROM reports;DELETE FROM jobs;DELETE FROM pg_ledger;DELETE FROM orders;DELETE FROM readings;DELETE FROM challenges;DELETE FROM session_auth;DELETE FROM sessions;DELETE FROM events;DELETE FROM audit;DELETE FROM rate_limits;",
  );
});
afterAll(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) rmSync(path + s, { force: true });
});
function paid(email = "async@example.invalid") {
  const { session: s } = svc.newSession();
  const cid = svc.requestOtp(s, email);
  svc.verifyOtp(s, cid, svc.localOtp(s, cid).code);
  const session = one<svc.Session>("SELECT * FROM sessions WHERE id=?", s.id)!;
  const reading = svc.makeReading(session, syntheticBirths.known);
  const order = svc.createOrder(session, reading, {
    terms: true,
    privacy: true,
    withdrawal: true,
    confirmedBirth: true,
    buyerAdult: true,
  });
  const key = svc.mockAuthenticate(session, order);
  svc.confirmPayment(session, order, key, 22000);
  return { session, order };
}
it("awaits without a DB transaction, saves exactly one immutable report and reopens without regeneration", async () => {
  const o = paid();
  let calls = 0;
  await svc.workOnceWithGenerator(async (chart) => {
    calls++;
    expect(one("SELECT state FROM jobs WHERE order_id=?", o.order)?.state).toBe(
      "running",
    );
    await Promise.resolve();
    return {
      ...generate(chart),
      provider: "openai",
      usage: {
        inputTokens: 123,
        outputTokens: 456,
        costKrw: null,
        estimatedUsdMicros: 2145,
      },
    };
  }, o.order);
  const a = svc.getReport(o.session, o.order),
    b = svc.getReport(o.session, o.order);
  expect(a.report).toEqual(b.report);
  expect(a.report.provider).toBe("openai");
  expect(
    await svc.workOnceWithGenerator(async (chart) => {
      calls++;
      return generate(chart);
    }, o.order),
  ).toBe(false);
  expect(calls).toBe(1);
  expect(
    one(
      "SELECT provider,input_tokens,output_tokens,estimated_usd_micros FROM report_usage WHERE order_id=?",
      o.order,
    ),
  ).toMatchObject({
    provider: "openai",
    input_tokens: 123,
    output_tokens: 456,
    estimated_usd_micros: 2145,
  });
  expect(one("SELECT count(*) n FROM reports")?.n).toBe(1);
  run("UPDATE sessions SET role='operations' WHERE id=?", o.session.id);
  run("INSERT INTO admin_auth VALUES(?,?)", o.session.id, Date.now());
  const admin = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    o.session.id,
  )!;
  expect(svc.adminOverview(admin).metrics).toMatchObject({
    aiSavedReports: 1,
    aiInputTokens: 123,
    aiOutputTokens: 456,
    aiEstimateUsdMicros: 2145,
    aiUnknownEstimates: 0,
    aiUnindexedReports: 0,
  });
  run(
    "UPDATE report_usage SET estimated_usd_micros=NULL WHERE order_id=?",
    o.order,
  );
  expect(svc.adminOverview(admin).metrics.aiUnknownEstimates).toBe(1);
  run("DELETE FROM admin_auth WHERE session_id=?", o.session.id);
});
it.each(["refunded", "deleted", "corrected", "expired"])(
  "does not publish after order becomes %s while awaiting",
  async (mode) => {
    const o = paid();
    await svc.workOnceWithGenerator(async (chart) => {
      if (mode === "refunded")
        run("UPDATE orders SET payment_status='refunded' WHERE id=?", o.order);
      if (mode === "deleted")
        run("UPDATE orders SET content_deleted=1 WHERE id=?", o.order);
      if (mode === "corrected")
        run("UPDATE orders SET version=version+1 WHERE id=?", o.order);
      if (mode === "expired")
        run("UPDATE orders SET expires=? WHERE id=?", Date.now() - 1, o.order);
      return generate(chart);
    }, o.order);
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
    expect(one("SELECT state FROM jobs WHERE order_id=?", o.order)?.state).toBe(
      "canceled",
    );
  },
);
it("a late response cannot overwrite the report completed by a newer lease owner", async () => {
  const o = paid();
  await svc.workOnceWithGenerator(async (chart) => {
    run(
      "UPDATE jobs SET lease_until=? WHERE order_id=?",
      Date.now() - 1,
      o.order,
    );
    await svc.workOnceWithGenerator(
      async (newer) => ({
        ...generate(newer),
        intro: "새로운 작업자가 저장한 충분히 긴 검증용 인사말입니다.",
      }),
      o.order,
    );
    return {
      ...generate(chart),
      intro: "늦게 끝난 이전 작업자의 충분히 긴 검증용 인사말입니다.",
    };
  }, o.order);
  expect(svc.getReport(o.session, o.order).report.intro).toContain(
    "새로운 작업자",
  );
  expect(
    one("SELECT attempts FROM jobs WHERE order_id=?", o.order)?.attempts,
  ).toBe(2);
});
it("holds malformed output for retry, then exhausts without exposing raw provider errors", async () => {
  const o = paid();
  for (let n = 0; n < 4; n++) {
    run(
      "UPDATE jobs SET scheduled=? WHERE order_id=?",
      Date.now() - 1,
      o.order,
    );
    await svc.workOnceWithGenerator(async () => {
      throw Error("secret provider detail must not be stored");
    }, o.order);
  }
  expect(
    one("SELECT fulfillment FROM orders WHERE id=?", o.order)?.fulfillment,
  ).toBe("failed");
  expect(one("SELECT error FROM jobs WHERE order_id=?", o.order)?.error).toBe(
    "GENERATION_UNAVAILABLE",
  );
  expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
});
it("selects only the requested order from mixed queues", async () => {
  const first = paid("first@example.invalid"),
    second = paid("second@example.invalid");
  await svc.workOnceWithGenerator(
    async (chart) => generate(chart),
    second.order,
  );
  expect(
    one("SELECT fulfillment FROM orders WHERE id=?", first.order)?.fulfillment,
  ).toBe("queued");
  expect(
    svc.getReport(second.session, second.order).report.chapters,
  ).toHaveLength(9);
});
it("rejects malformed generated data before any report or ready notification is published", async () => {
  const o = paid();
  await svc.workOnceWithGenerator(
    async (chart) => ({ ...generate(chart), year: 1900 }),
    o.order,
  );
  expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
  expect(
    one("SELECT fulfillment FROM orders WHERE id=?", o.order)?.fulfillment,
  ).toBe("retrying");
  expect(
    one("SELECT count(*) n FROM events WHERE event='report_ready'")?.n,
  ).toBe(0);
});
it("an old failed attempt cannot mark a newer completed job as retrying", async () => {
  const o = paid();
  await svc.workOnceWithGenerator(async () => {
    run(
      "UPDATE jobs SET lease_until=? WHERE order_id=?",
      Date.now() - 1,
      o.order,
    );
    await svc.workOnceWithGenerator(async (chart) => generate(chart), o.order);
    throw Error("late failed provider response");
  }, o.order);
  expect(one("SELECT state FROM jobs WHERE order_id=?", o.order)?.state).toBe(
    "done",
  );
  expect(svc.getReport(o.session, o.order).report.chapters).toHaveLength(9);
});
