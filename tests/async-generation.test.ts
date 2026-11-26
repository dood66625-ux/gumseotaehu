import { execFileSync } from "node:child_process";
import {
  enrollAiWorker,
  readAiWorkerEnrollment,
} from "../lib/ai-worker-enrollment";
import { createEncryptedBackup, restoreEncryptedBackup } from "../lib/backup";
import { config } from "../lib/config";
import { runConfiguredAiCycle } from "../lib/ai-worker-runtime";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { aiSpendLedger } from "../lib/ai-spend-ledger";
import { inspectAiWorkerQueue, runAiWorkerCycle } from "../lib/ai-worker-cycle";
import { prepareAiOrder } from "../lib/order-generation";
import { runOrderOpenAiJob } from "../lib/ai-order-runner";
import { approvedOpenAiModel } from "../lib/integrations/openai-http";
import { runBudgetedAiJob } from "../lib/ai-generation-worker";
import { rmSync, mkdtempSync } from "node:fs";
import { closeDb, db, one, run } from "../lib/db";
import * as svc from "../lib/service";
import { generate } from "../lib/interpretation";
import {
  syntheticChart,
  syntheticBirths,
} from "../lib/integrations/ai-synthetic-fixtures";
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  db().exec("DROP TABLE IF EXISTS ai_worker_enrollment;");
  if (
    one(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_spend_calls'",
    )
  )
    db().exec("DELETE FROM ai_spend_calls;DELETE FROM ai_spend_policy;");
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

function aiPaid(email?: string) {
  const order = paid(email);
  prepareAiOrder(order.order);
  return order;
}
function testLedger() {
  const database = new DatabaseSync(":memory:");
  return {
    database,
    ledger: aiSpendLedger(database, {
      dailyUsdMicros: 60000,
      lifetimeUsdMicros: 60000,
      reservationUsdMicros: 60000,
    }),
  };
}
it("budgeted candidate is inactive by default and leaves the selected job untouched", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  try {
    let calls = 0;
    expect(
      await runBudgetedAiJob({
        orderId: order.order,
        ledger,
        generate: async (chart) => {
          calls++;
          return generate(chart);
        },
      }),
    ).toBe(false);
    expect(calls).toBe(0);
    expect(
      one("SELECT state FROM jobs WHERE order_id=?", order.order)?.state,
    ).toBe("queued");
    expect(ledger.summary().calls).toBe(0);
  } finally {
    database.close();
  }
});
it("reserves the authoritative order version before generation and reopens without another call", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    const invoke = () =>
      runBudgetedAiJob({
        enabled: true,
        orderId: order.order,
        ledger,
        generate: async (chart, usage) => {
          calls++;
          expect(ledger.summary()).toMatchObject({ calls: 1, pending: 1 });
          usage(12000);
          return { ...generate(chart), provider: "openai" };
        },
      });
    await invoke();
    expect(svc.getReport(order.session, order.order).report.provider).toBe(
      "openai",
    );
    expect(
      svc.getReport(order.session, order.order).report.usage.estimatedUsdMicros,
    ).toBe(12000);
    expect(await invoke()).toBe(false);
    expect(calls).toBe(1);
    expect(
      database
        .prepare("SELECT order_id,version,state,actual FROM ai_spend_calls")
        .get(),
    ).toMatchObject({
      order_id: order.order,
      version: 1,
      state: "completed",
      actual: 12000,
    });
  } finally {
    database.close();
  }
});
it("a lost response stays reserved and a scheduled retry cannot call the generator again", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    const invoke = () =>
      runBudgetedAiJob({
        enabled: true,
        orderId: order.order,
        ledger,
        generate: async () => {
          calls++;
          throw Error("private provider detail");
        },
      });
    await invoke();
    run("UPDATE jobs SET scheduled=0 WHERE order_id=?", order.order);
    await invoke();
    expect(calls).toBe(1);
    expect(ledger.summary()).toMatchObject({ calls: 1, uncertain: 1 });
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
    expect(
      JSON.stringify(
        one("SELECT error FROM jobs WHERE order_id=?", order.order),
      ),
    ).not.toContain("private provider detail");
  } finally {
    database.close();
  }
});
it("insufficient budget blocks a new order before its generator runs", async () => {
  const first = aiPaid("first@example.invalid"),
    second = aiPaid("second@example.invalid");
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    for (const order of [first, second])
      await runBudgetedAiJob({
        enabled: true,
        orderId: order.order,
        ledger,
        generate: async (chart, usage) => {
          calls++;
          usage(1000);
          return { ...generate(chart), provider: "openai" };
        },
      });
    expect(calls).toBe(1);
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(1);
    expect(
      one("SELECT fulfillment FROM orders WHERE id=?", second.order)
        ?.fulfillment,
    ).toBe("retrying");
  } finally {
    database.close();
  }
});
it("missing usage or malformed content never publishes a ready report and retains cost exposure", async () => {
  for (const mode of [
    "missing-usage",
    "bad-content",
    "cost-mismatch",
    "bad-provider",
  ]) {
    const order = aiPaid(mode + "@example.invalid");
    const { database, ledger } = testLedger();
    try {
      await runBudgetedAiJob({
        enabled: true,
        orderId: order.order,
        ledger,
        generate: async (chart, usage) => {
          if (mode !== "missing-usage") usage(2000);
          const report = generate(chart);
          return {
            ...report,
            provider: mode === "bad-provider" ? "local-rule-mock" : "openai",
            year: mode === "bad-content" ? 1900 : chart.target,
            usage: {
              ...report.usage,
              estimatedUsdMicros: mode === "cost-mismatch" ? 1 : undefined,
            },
          };
        },
      });
      expect(ledger.summary()).toMatchObject({
        calls: 1,
        uncertain: 1,
        lifetimeReservedOrActualUsdMicros: 60000,
      });
      expect(
        one("SELECT count(*) n FROM reports WHERE order_id=?", order.order)?.n,
      ).toBe(0);
    } finally {
      database.close();
    }
  }
});

it("a refund during generation prevents publication without releasing the spent reservation", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  try {
    await runBudgetedAiJob({
      enabled: true,
      orderId: order.order,
      ledger,
      generate: async (chart, usage) => {
        usage(9000);
        run(
          "UPDATE orders SET payment_status='refunded' WHERE id=?",
          order.order,
        );
        return { ...generate(chart), provider: "openai" };
      },
    });
    expect(
      one("SELECT count(*) n FROM reports WHERE order_id=?", order.order)?.n,
    ).toBe(0);
    expect(ledger.summary()).toMatchObject({
      calls: 1,
      lifetimeReservedOrActualUsdMicros: 60000,
    });
  } finally {
    database.close();
  }
});

it("the complete HTTP adapter path reserves first, validates and stores once without network on reopen", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    const invoke = () =>
      runOrderOpenAiJob({
        enabled: true,
        approval: "customer-data-approved",
        orderId: order.order,
        ledger,
        apiKey: "sk-offline_test_key_012345678901234567890",
        fetch: async (url, init) => {
          calls++;
          expect(String(url)).toBe("https://api.openai.com/v1/responses");
          expect(ledger.summary()).toMatchObject({ calls: 1, pending: 1 });
          const request = JSON.parse(String(init?.body));
          expect(request.store).toBe(false);
          expect(String(init?.body)).not.toContain(syntheticBirths.known.date);
          expect(String(init?.body)).not.toContain(syntheticBirths.known.name);
          const report = generate(
            (
              await import("../lib/integrations/ai-synthetic-fixtures")
            ).syntheticChart("known"),
          );
          for (const chapter of report.chapters)
            while (chapter.text.length < 350)
              chapter.text +=
                " 오늘의 경험을 기록하고 작은 실천을 차분히 정해 보거라.";
          return Response.json({
            model: approvedOpenAiModel,
            status: "completed",
            usage: { input_tokens: 100, output_tokens: 200 },
            output_text: JSON.stringify({
              intro: report.intro,
              chapters: report.chapters,
              notes: report.notes,
            }),
          });
        },
      });
    await invoke();
    const stored = svc.getReport(order.session, order.order).report;
    expect(stored).toMatchObject({
      provider: "openai",
      promptVersion: "taehou-ai-3",
      generation: { model: approvedOpenAiModel },
      usage: { estimatedUsdMicros: 975 },
    });
    expect(svc.getReport(order.session, order.order).report).toEqual(stored);
    expect(await invoke()).toBe(false);
    expect(calls).toBe(1);
    expect(ledger.summary()).toMatchObject({
      calls: 1,
      pending: 0,
      uncertain: 0,
    });
  } finally {
    database.close();
  }
});
it("the HTTP path stays off without opt-in and rejects missing approval before claiming a job", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  let calls = 0;
  const options = {
    orderId: order.order,
    ledger,
    apiKey: "unused",
    fetch: async () => {
      calls++;
      throw Error("must not send");
    },
  };
  try {
    expect(await runOrderOpenAiJob(options)).toBe(false);
    await expect(
      runOrderOpenAiJob({ ...options, enabled: true }),
    ).rejects.toThrow("EXTERNAL_TRANSMISSION_NOT_APPROVED");
    await expect(
      runOrderOpenAiJob({
        ...options,
        enabled: true,
        approval: "customer-data-approved",
      }),
    ).rejects.toThrow("AI_CREDENTIAL_REQUIRED");
    expect(calls).toBe(0);
    expect(ledger.summary().calls).toBe(0);
    expect(
      one("SELECT state FROM jobs WHERE order_id=?", order.order)?.state,
    ).toBe("queued");
  } finally {
    database.close();
  }
});
it("provider quota rejection is held without repeated HTTP calls or a partial report", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    const invoke = () =>
      runOrderOpenAiJob({
        enabled: true,
        approval: "customer-data-approved",
        orderId: order.order,
        ledger,
        apiKey: "sk-offline_test_key_012345678901234567890",
        fetch: async () => {
          calls++;
          return Response.json(
            {
              error: {
                code: "insufficient_quota",
                message: "private provider detail",
              },
            },
            { status: 429 },
          );
        },
      });
    await invoke();
    run("UPDATE jobs SET scheduled=0 WHERE order_id=?", order.order);
    await invoke();
    expect(calls).toBe(1);
    expect(ledger.summary()).toMatchObject({ calls: 1, uncertain: 1 });
    expect(
      one("SELECT count(*) n FROM reports WHERE order_id=?", order.order)?.n,
    ).toBe(0);
  } finally {
    database.close();
  }
});

it("operations can inspect an unresolved reservation but cannot reset the same order into another AI attempt", () => {
  const order = aiPaid();
  const ledger = aiSpendLedger(db(), {
    dailyUsdMicros: 60000,
    lifetimeUsdMicros: 60000,
    reservationUsdMicros: 60000,
  });
  const reservation = ledger.reserve(order.order, 1);
  ledger.finish(reservation, "uncertain");
  expect(() => svc.adminOverview(order.session)).toThrow();
  run("UPDATE sessions SET role='operations' WHERE id=?", order.session.id);
  run("INSERT INTO admin_auth VALUES(?,?)", order.session.id, Date.now());
  const admin = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    order.session.id,
  )!;
  const overview = svc.adminOverview(admin);
  expect(overview.aiSpendReview.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        orderId: order.order,
        version: 1,
        state: "uncertain",
        estimatedUsdMicros: null,
      }),
    ]),
  );
  expect(() => svc.adminRetry(admin, order.order)).toThrow(
    "AI 요청 기록이 있어",
  );
  expect(ledger.summary()).toMatchObject({ calls: 1, uncertain: 1 });
  expect(
    one("SELECT attempts FROM jobs WHERE order_id=?", order.order)?.attempts,
  ).toBe(0);
});

it("mock and AI workers cannot consume each other's orders", async () => {
  const ai = aiPaid("lane-ai@example.invalid"),
    mock = paid("lane-mock@example.invalid");
  const { database, ledger } = testLedger();
  let calls = 0;
  try {
    expect(
      await runBudgetedAiJob({
        enabled: true,
        orderId: mock.order,
        ledger,
        generate: async (chart) => {
          calls++;
          return { ...generate(chart), provider: "openai" };
        },
      }),
    ).toBe(false);
    expect(calls).toBe(0);
    expect(ledger.summary().calls).toBe(0);
    expect(svc.workOnce()).toBe(true);
    expect(svc.getReport(mock.session, mock.order).report.provider).toBe(
      "local-rule-mock",
    );
    expect(svc.workOnce()).toBe(false);
    expect(
      one("SELECT fulfillment FROM orders WHERE id=?", ai.order)?.fulfillment,
    ).toBe("queued");
    expect(() => prepareAiOrder(mock.order)).toThrow(
      "AI_ORDER_ALREADY_STARTED",
    );
  } finally {
    database.close();
  }
});
it("a failed AI order is never filled with a mock report on retry or restart", async () => {
  const order = aiPaid();
  const { database, ledger } = testLedger();
  try {
    await runBudgetedAiJob({
      enabled: true,
      orderId: order.order,
      ledger,
      generate: async () => {
        throw Error("lost response");
      },
    });
    run("UPDATE jobs SET scheduled=0 WHERE order_id=?", order.order);
    closeDb();
    db();
    expect(svc.workOnce()).toBe(false);
    expect(
      one("SELECT fulfillment FROM orders WHERE id=?", order.order)
        ?.fulfillment,
    ).toBe("retrying");
    expect(
      one("SELECT count(*) n FROM reports WHERE order_id=?", order.order)?.n,
    ).toBe(0);
  } finally {
    database.close();
  }
});
it("AI lane is retained when the current job is repaired or the order version changes", () => {
  const order = aiPaid();
  expect(prepareAiOrder(order.order)).toBe(false);
  run("DELETE FROM jobs WHERE order_id=?", order.order);
  expect(svc.workOnce()).toBe(false);
  expect(
    one("SELECT state FROM jobs WHERE order_id=?", order.order)?.state,
  ).toBe("queued");
  run("UPDATE orders SET version=2 WHERE id=?", order.order);
  run(
    "INSERT INTO jobs(id,order_id,version,state,scheduled) VALUES(?, ?,2,'queued',0)",
    "lane-version-two",
    order.order,
  );
  expect(svc.workOnce()).toBe(false);
  expect(
    one("SELECT version FROM orders WHERE id=?", order.order)?.version,
  ).toBe(2);
});

const cyclePolicy = {
  dailyUsdMicros: 120000,
  lifetimeUsdMicros: 120000,
  reservationUsdMicros: 60000,
};
it("AI worker cycle is disabled without opt-in and blocks an unprepared or changed policy", async () => {
  let calls = 0;
  const invoke = () => {
    calls++;
    return Promise.resolve(true);
  };
  expect(
    await runAiWorkerCycle(db(), { policy: cyclePolicy, runJob: invoke }),
  ).toMatchObject({ state: "disabled", processed: 0 });
  expect(
    await runAiWorkerCycle(db(), {
      enabled: true,
      policy: cyclePolicy,
      runJob: invoke,
    }),
  ).toMatchObject({ state: "blocked", processed: 0 });
  aiSpendLedger(db(), cyclePolicy);
  expect(
    inspectAiWorkerQueue(db(), { ...cyclePolicy, dailyUsdMicros: 60000 }),
  ).toMatchObject({ state: "blocked", reason: "AI_WORKER_POLICY_MISMATCH" });
  expect(calls).toBe(0);
});
it("AI worker cycle persists completion across restart without draining the mock queue", async () => {
  const order = aiPaid("cycle-ai@example.invalid"),
    mock = paid("cycle-mock@example.invalid");
  let ledger = aiSpendLedger(db(), cyclePolicy),
    calls = 0;
  const runJob = (orderId: string) =>
    runBudgetedAiJob({
      enabled: true,
      orderId,
      ledger,
      generate: async (chart, usage) => {
        calls++;
        usage(1500);
        return { ...generate(chart), provider: "openai" };
      },
    });
  expect(
    await runAiWorkerCycle(db(), {
      enabled: true,
      policy: cyclePolicy,
      runJob,
    }),
  ).toMatchObject({ state: "ready", processed: 1 });
  const report = svc.getReport(order.session, order.order).report;
  closeDb();
  db();
  ledger = aiSpendLedger(db(), cyclePolicy);
  expect(
    await runAiWorkerCycle(db(), {
      enabled: true,
      policy: cyclePolicy,
      runJob,
    }),
  ).toMatchObject({ processed: 0 });
  expect(calls).toBe(1);
  expect(svc.getReport(order.session, order.order).report).toEqual(report);
  expect(
    one("SELECT fulfillment FROM orders WHERE id=?", mock.order)?.fulfillment,
  ).toBe("queued");
});
it("startup holds interrupted reservations and does not increment retry attempts", async () => {
  const order = aiPaid();
  const ledger = aiSpendLedger(db(), cyclePolicy);
  ledger.reserve(order.order, 1);
  closeDb();
  db();
  let calls = 0;
  const result = await runAiWorkerCycle(db(), {
    enabled: true,
    policy: cyclePolicy,
    runJob: async () => {
      calls++;
      return true;
    },
  });
  expect(result).toMatchObject({ state: "ready", processed: 0, held: 1 });
  expect(calls).toBe(0);
  expect(
    one("SELECT attempts FROM jobs WHERE order_id=?", order.order)?.attempts,
  ).toBe(0);
});
it("shutdown stops between jobs and the next cycle can resume the unstarted order", async () => {
  aiPaid("cycle-one@example.invalid");
  aiPaid("cycle-two@example.invalid");
  const ledger = aiSpendLedger(db(), cyclePolicy);
  let stopping = false,
    calls = 0;
  const runJob = (orderId: string) =>
    runBudgetedAiJob({
      enabled: true,
      orderId,
      ledger,
      generate: async (chart, usage) => {
        calls++;
        usage(1000);
        stopping = true;
        return { ...generate(chart), provider: "openai" };
      },
    });
  expect(
    await runAiWorkerCycle(db(), {
      enabled: true,
      policy: cyclePolicy,
      limit: 2,
      stopping: () => stopping,
      runJob,
    }),
  ).toMatchObject({ processed: 1 });
  expect(calls).toBe(1);
  stopping = false;
  expect(
    await runAiWorkerCycle(db(), {
      enabled: true,
      policy: cyclePolicy,
      limit: 2,
      stopping: () => stopping,
      runJob,
    }),
  ).toMatchObject({ processed: 1 });
  expect(calls).toBe(2);
});

it("a higher recorded cost pauses the batch before another job spends retry attempts", async () => {
  aiPaid("cycle-cost-one@example.invalid");
  aiPaid("cycle-cost-two@example.invalid");
  const ledger = aiSpendLedger(db(), cyclePolicy);
  let calls = 0;
  const result = await runAiWorkerCycle(db(), {
    enabled: true,
    policy: cyclePolicy,
    limit: 2,
    runJob: (orderId) =>
      runBudgetedAiJob({
        enabled: true,
        orderId,
        ledger,
        generate: async (chart, usage) => {
          calls++;
          usage(70000);
          return { ...generate(chart), provider: "openai" };
        },
      }),
  });
  expect(result).toMatchObject({
    state: "blocked",
    reason: "AI_WORKER_BUDGET_EXHAUSTED",
    processed: 1,
  });
  expect(calls).toBe(1);
  expect(
    one("SELECT count(*) n FROM jobs WHERE state='queued' AND attempts=0")?.n,
  ).toBe(1);
});

const runtimePolicy = {
  dailyUsdMicros: 120000,
  lifetimeUsdMicros: 180000,
  reservationUsdMicros: 60000,
};
function runtimeSettings(file: string) {
  vi.stubEnv("APP_ORIGIN", "https://runtime.example.invalid");
  vi.stubEnv("AI_WORKER_MODE", "openai");
  vi.stubEnv("CUSTOMER_AI_APPROVAL", "customer-data-approved");
  vi.stubEnv("AI_DAILY_USD_MICROS", "120000");
  vi.stubEnv("AI_LIFETIME_USD_MICROS", "180000");
  vi.stubEnv("AI_RESERVATION_USD_MICROS", "60000");
  vi.stubEnv("AI_CUTOVER_FILE", file);
  vi.stubEnv("OPENAI_API_KEY", "sk-offline_test_key_012345678901234567890");
}
function runtimeEnroll(file: string, now: number) {
  db().exec(
    "CREATE TABLE IF NOT EXISTS privacy_checkpoint_source(id INTEGER PRIMARY KEY,source_id TEXT NOT NULL)",
  );
  run(
    "INSERT OR IGNORE INTO privacy_checkpoint_source VALUES(1,?)",
    "11111111-1111-4111-8111-111111111111",
  );
  return enrollAiWorker(db(), {
    policy: runtimePolicy,
    origin: config().origin,
    file,
    key: config().key,
    approval: "customer-data-approved",
    now,
  });
}
function successfulAiResponse() {
  const report = generate(syntheticChart("known"));
  for (const chapter of report.chapters)
    while (chapter.text.length < 350)
      chapter.text += " 오늘의 경험을 기록하고 작은 실천을 차분히 정해 보거라.";
  return Response.json({
    model: approvedOpenAiModel,
    status: "completed",
    usage: { input_tokens: 100, output_tokens: 200 },
    output_text: JSON.stringify({
      intro: report.intro,
      chapters: report.chapters,
      notes: report.notes,
    }),
  });
}
it("runtime remains disabled by default and rejects unapproved mode before any provider call", async () => {
  const send = vi.fn<typeof fetch>();
  vi.stubEnv("AI_WORKER_MODE", "");
  expect(await runConfiguredAiCycle({ fetch: send })).toMatchObject({
    state: "disabled",
    processed: 0,
  });
  vi.stubEnv("AI_WORKER_MODE", "typo");
  await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
    "INVALID_AI_WORKER_MODE",
  );
  vi.stubEnv("AI_WORKER_MODE", "openai");
  vi.stubEnv("CUSTOMER_AI_APPROVAL", "");
  await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
    "EXTERNAL_TRANSMISSION_NOT_APPROVED",
  );
  expect(send).not.toHaveBeenCalled();
});
it("enrolled runtime excludes historical queues and persists one generated report across cycles", async () => {
  const directory = mkdtempSync("var/ai-runtime-");
  try {
    const file = directory + "/cutover.json";
    const old = aiPaid("old-runtime@example.invalid");
    const now = Date.now();
    runtimeSettings(file);
    runtimeEnroll(file, now);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    const fresh = aiPaid("fresh-runtime@example.invalid");
    const send = vi.fn(async () => successfulAiResponse());
    expect(await runConfiguredAiCycle({ fetch: send })).toMatchObject({
      processed: 1,
    });
    expect(svc.getReport(fresh.session, fresh.order).report.provider).toBe(
      "openai",
    );
    expect(
      one("SELECT state FROM jobs WHERE order_id=?", old.order)?.state,
    ).toBe("queued");
    closeDb(); // Reopen the actual app DB, not only a new coordinator instance.
    expect(await runConfiguredAiCycle({ fetch: send })).toMatchObject({
      processed: 0,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(one("SELECT count(*) n FROM ai_spend_calls")?.n).toBe(1);
    await expect(
      runConfiguredAiCycle({ fetch: send, stopping: () => true }),
    ).resolves.toMatchObject({ processed: 0 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("runtime refuses changed policy, invalid credential and recovery hold before consuming jobs", async () => {
  const directory = mkdtempSync("var/ai-runtime-gates-");
  try {
    const file = directory + "/cutover.json",
      now = Date.now();
    runtimeSettings(file);
    runtimeEnroll(file, now);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    const order = aiPaid();
    const send = vi.fn<typeof fetch>();
    vi.stubEnv("AI_DAILY_USD_MICROS", "60000");
    await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
      "AI_ENROLLMENT_BINDING_MISMATCH",
    );
    vi.stubEnv("AI_DAILY_USD_MICROS", "120000");
    vi.stubEnv("OPENAI_API_KEY", "invalid");
    await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
      "AI_CREDENTIAL_REQUIRED",
    );
    vi.stubEnv("OPENAI_API_KEY", "sk-offline_test_key_012345678901234567890");
    run("UPDATE ai_worker_enrollment SET recovery_hold=1");
    await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
      "AI_RESTORE_RECONCILIATION_REQUIRED",
    );
    expect(() => runtimeEnroll(file, now)).toThrow(
      "AI_WORKER_ALREADY_ENROLLED",
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      one("SELECT attempts FROM jobs WHERE order_id=?", order.order)?.attempts,
    ).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("lost provider response remains reserved across runtime restarts without another HTTP request", async () => {
  const directory = mkdtempSync("var/ai-runtime-lost-");
  try {
    const now = Date.now();
    runtimeSettings(directory + "/cutover.json");
    runtimeEnroll(directory + "/cutover.json", now);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    const order = aiPaid();
    const send = vi.fn(async () => {
      throw Error("private lost response");
    });
    await runConfiguredAiCycle({ fetch: send });
    run("UPDATE jobs SET scheduled=0 WHERE order_id=?", order.order);
    expect(await runConfiguredAiCycle({ fetch: send })).toMatchObject({
      processed: 0,
      held: 1,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(one("SELECT state FROM ai_spend_calls")?.state).toBe("uncertain");
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("encrypted restore holds the AI runtime even when the signed file and policy match", async () => {
  const directory = mkdtempSync("var/ai-runtime-restore-");
  try {
    const now = Date.now(),
      file = directory + "/cutover.json";
    runtimeSettings(file);
    runtimeEnroll(file, now);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    aiPaid();
    paid("restore-mock-queue@example.invalid");
    const archive = directory + "/backup.gsb",
      target = directory + "/restored.sqlite";
    await createEncryptedBackup(db(), archive, config().key);
    restoreEncryptedBackup(archive, target, config().key);
    const copy = new DatabaseSync(target);
    try {
      expect(() =>
        readAiWorkerEnrollment(copy, {
          policy: runtimePolicy,
          origin: config().origin,
          file,
          key: config().key,
        }),
      ).toThrow("AI_RESTORE_RECONCILIATION_REQUIRED");
      expect(
        copy.prepare("SELECT count(*) n FROM ai_spend_calls").get()?.n,
      ).toBe(0);
    } finally {
      copy.close();
    }
    closeDb();
    vi.stubEnv("DATABASE_PATH", target);
    const send = vi.fn<typeof fetch>();
    await expect(runConfiguredAiCycle({ fetch: send })).rejects.toThrow(
      "AI_RESTORE_RECONCILIATION_REQUIRED",
    );
    expect(send).not.toHaveBeenCalled();
    vi.stubEnv("AI_WORKER_MODE", "disabled");
    expect(svc.workOnce()).toBe(false);
    expect(one("SELECT count(*) n FROM reports")?.n).toBe(0);
    expect(one("SELECT sum(attempts) n FROM jobs")?.n).toBe(0);
  } finally {
    closeDb();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("offline operator CLI selects one post-cutover order without generating or printing its ID", () => {
  const directory = mkdtempSync("var/ai-runtime-cli-");
  try {
    const now = Date.now();
    runtimeSettings(directory + "/cutover.json");
    runtimeEnroll(directory + "/cutover.json", now);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    const fresh = paid("cli-runtime@example.invalid");
    const invoke = (...args: string[]) =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/ai-worker-control.ts", ...args],
        {
          env: { ...process.env },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    const result = invoke("--select-order", fresh.order);
    expect(JSON.parse(result)).toMatchObject({
      state: "selected",
      generationEnabledByCommand: false,
    });
    expect(result).not.toContain(fresh.order);
    expect(JSON.parse(invoke("--select-order", fresh.order)).state).toBe(
      "already-selected",
    );
    expect(JSON.parse(invoke("--status")).state).toBe("ready");
    expect(one("SELECT count(*) n FROM ai_spend_calls")?.n).toBe(0);
    expect(
      one("SELECT attempts FROM jobs WHERE order_id=?", fresh.order)?.attempts,
    ).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("persists only safe generation error codes and HTTP status", () => {
  expect(svc.generationFailureCode(Object.assign(new Error("AI_QUOTA_EXHAUSTED"), {httpStatus:429}))).toBe("AI_QUOTA_EXHAUSTED_HTTP_429");
  expect(svc.generationFailureCode(new Error("provider secret: customer@example.invalid"))).toBe("GENERATION_UNAVAILABLE");
});
