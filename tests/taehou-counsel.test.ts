import { aiSpendReview } from "../lib/ai-spend-review";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { db, one, run, closeDb } from "../lib/db";
import * as svc from "../lib/service";
import { generate } from "../lib/interpretation";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import {
  queueCounsel,
  readCounsel,
  counselEntries,
} from "../lib/taehou-counsel";
import { runCounselCycle } from "../lib/taehou-counsel-worker";
import { enrollAiWorker } from "../lib/ai-worker-enrollment";
import { aiEnrollmentOptions } from "../lib/ai-worker-runtime";
import { approvedOpenAiModel } from "../lib/integrations/openai-http";
import { config } from "../lib/config";
import { reportPdf } from "../lib/pdf";
import { applyDeletions } from "../lib/deletion-manifest";
let dir: string, s: svc.Session, oid: string;
const answer =
  "그대가 이미 잘하고 있는 일을 하나 골라 보거라. 운명서에 담긴 장점은 모든 일을 혼자 해내라는 뜻이 아니니라. 일을 작게 나누어 그대의 속도로 시작해도 좋겠구나.\n\n새로운 일을 정할 때에는 마음이 가는 까닭과 지금 할 수 있는 준비를 나란히 적어 보거라. 한 번에 큰 답을 구하기보다 실제 경험을 통해 그대에게 맞는 길을 살피면 좋겠느니라.\n\n오늘은 미뤄둔 일 가운데 십 분 안에 시작할 수 있는 것 하나만 골라 보거라. 작은 기록이 다음 선택을 도울 수 있느니라.";
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "taehou-counsel-"));
  for (const [k, v] of Object.entries({
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    DATA_KEY: "e".repeat(64),
    AUTH_SECRET: "counsel-test-".repeat(4),
    ADMIN_PASSWORD: "counsel-admin-".repeat(4),
    ADMIN_TOTP_SECRET: "ab".repeat(20),
    DATABASE_PATH: join(dir, "test.sqlite"),
    APP_ORIGIN: "http://localhost:3000",
    SALES_MODE: "",
    AI_WORKER_MODE: "",
    CUSTOMER_AI_APPROVAL: "",
  }))
    vi.stubEnv(k, v);
  const created = svc.newSession();
  const cid = svc.requestOtp(created.session, "counsel@example.invalid");
  svc.verifyOtp(created.session, cid, svc.localOtp(created.session, cid).code);
  s = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    created.session.id,
  )!;
  const rid = svc.makeReading(s, syntheticBirths.known);
  oid = svc.createOrder(s, rid, {
    terms: true,
    privacy: true,
    withdrawal: true,
    confirmedBirth: true,
    buyerAdult: true,
  });
  svc.confirmPayment(s, oid, svc.mockAuthenticate(s, oid), 22000);
  await svc.workOnceWithGenerator(
    async (chart) => ({ ...generate(chart), provider: "openai" }),
    oid,
  );
  for (const [k, v] of Object.entries({
    APP_ORIGIN: "https://counsel.example.invalid",
    AI_WORKER_MODE: "openai",
    CUSTOMER_AI_APPROVAL: "customer-data-approved",
    AI_DAILY_USD_MICROS: "5000000",
    AI_LIFETIME_USD_MICROS: "30000000",
    AI_RESERVATION_USD_MICROS: "500000",
    AI_CUTOVER_FILE: join(dir, "cutover.json"),
    OPENAI_API_KEY: "sk-offline_counsel_test_012345678901234567890",
  }))
    vi.stubEnv(k, v);
  db().exec(
    "CREATE TABLE IF NOT EXISTS privacy_checkpoint_source(id INTEGER PRIMARY KEY,source_id TEXT NOT NULL)",
  );
  run("INSERT INTO privacy_checkpoint_source VALUES(1,?)", randomUUID());
  enrollAiWorker(db(), {
    ...aiEnrollmentOptions(),
    approval: "customer-data-approved",
    now: Date.now() - 60000,
  });
});
afterEach(() => {
  closeDb();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
function success(hook?: () => void) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(one("SELECT count(*) n FROM ai_spend_calls")?.n).toBeGreaterThan(0);
    hook?.();
    return Response.json({
      model: approvedOpenAiModel,
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 200 },
      output_text: JSON.stringify({ answer }),
    });
  });
}
it("enforces owner access, Unicode 50-character length and idempotent request identity", () => {
  expect(() => readCounsel(svc.newSession().session, oid)).toThrow();
  expect(() => queueCounsel(s, oid, "가".repeat(51), randomUUID())).toThrow(
    "50",
  );
  const key = randomUUID();
  expect(queueCounsel(s, oid, "가".repeat(50), key).remaining).toBe(2);
  expect(queueCounsel(s, oid, "가".repeat(50), key).remaining).toBe(2);
  expect(() => queueCounsel(s, oid, "또 물을까?", randomUUID())).toThrow(
    "기다리",
  );
  expect(
    one("SELECT question_enc FROM taehou_counsel")!.question_enc,
  ).not.toContain("가".repeat(50));
});
it("answers exactly three times, restores history across DB reopen and never regenerates on reads", async () => {
  const fetch = success();
  for (let i = 0; i < 3; i++) {
    queueCounsel(s, oid, `물음 ${i + 1}`, randomUUID());
    expect(await runCounselCycle({ fetch })).toBe(true);
  }
  expect(readCounsel(s, oid).remaining).toBe(0);
  expect(() => queueCounsel(s, oid, "네번째", randomUUID())).toThrow("모두");
  closeDb();
  expect(readCounsel(s, oid).entries.every((e) => e.answer === answer)).toBe(
    true,
  );
  expect(await runCounselCycle({ fetch })).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(aiSpendReview(db()).entries).toHaveLength(0);
  expect(one("SELECT sum(reserved) total FROM ai_spend_calls")?.total).toBe(
    180000,
  );
  const payload = String(fetch.mock.calls[0][1]?.body);
  expect(payload).not.toContain(syntheticBirths.known.date);
  expect(payload).not.toContain(syntheticBirths.known.name);
  expect(one("SELECT version FROM orders WHERE id=?", oid)?.version).toBe(1);
});
it("holds lost HTTP responses without a second provider call", async () => {
  queueCounsel(s, oid, "일을 어떻게 시작할까?", randomUUID());
  const fetch = vi.fn(async () => {
    throw Error("private provider details");
  });
  expect(await runCounselCycle({ fetch })).toBe(false);
  expect(await runCounselCycle({ fetch })).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(readCounsel(s, oid).entries[0]).toMatchObject({
    state: "failed",
    answer: null,
  });
  expect(one("SELECT state FROM ai_spend_calls")?.state).toBe("uncertain");
});
it("revoked payment during HTTP cannot publish an answer", async () => {
  queueCounsel(s, oid, "일을 어떻게 시작할까?", randomUUID());
  await runCounselCycle({
    fetch: success(() =>
      run("UPDATE orders SET payment_status='refunded' WHERE id=?", oid),
    ),
  });
  expect(one("SELECT answer_enc FROM taehou_counsel")?.answer_enc).toBeNull();
  expect(() => readCounsel(s, oid)).toThrow();
});
it("records answered conversation in PDF without the removed explanatory sections", async () => {
  queueCounsel(s, oid, "나의 장점은 무엇일까?", randomUUID());
  await runCounselCycle({ fetch: success() });
  const pdf = await reportPdf({
    ...svc.getReport(s, oid),
    counsel: counselEntries(oid),
  });
  const file = join(dir, "report.pdf");
  writeFileSync(file, pdf);
  const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  expect(text).toContain("나의 장점은 무엇일까?");
  expect(text).toContain("태후에게 남긴 물음");
  expect(text).not.toMatch(
    /낯선 말이 있었느냐|계산 기준과 해석의 범위|풀이의 계산 기록/,
  );
});
it("erases encrypted questions, answers and response evidence when applying a content-deletion manifest", async () => {
  queueCounsel(s, oid, "나의 장점은 무엇일까?", randomUUID());
  await runCounselCycle({ fetch: success() });
  applyDeletions(db(), [{ orderId: oid, deletedAt: Date.now() }], config().key);
  expect(one("SELECT count(*) n FROM taehou_counsel")?.n).toBe(0);
  expect(() => readCounsel(s, oid)).toThrow();
});
it("refuses a question without consuming its slot when the budget is full", async () => {
  for (let n = 0; n < 10; n++)
    run(
      "INSERT INTO ai_spend_calls(id,order_id,version,day,reserved,state,created) VALUES(?,?,?,?,?,'uncertain',?)",
      randomUUID(),
      randomUUID(),
      1,
      new Date().toISOString().slice(0, 10),
      500000,
      Date.now(),
    );
  const fetch = success();
  expect(() =>
    queueCounsel(s, oid, "나의 장점은 무엇일까?", randomUUID()),
  ).toThrow("차감하지");
  expect(readCounsel(s, oid).remaining).toBe(3);
  expect(await runCounselCycle({ fetch })).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
