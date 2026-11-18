import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { aiSpendLedger } from "../lib/ai-spend-ledger";
import { runOrderOpenAiJob } from "../lib/ai-order-runner";
import { approvedOpenAiModel } from "../lib/integrations/openai-http";
import { runBudgetedAiJob } from "../lib/ai-generation-worker";
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
  const order = paid();
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
  const order = paid();
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
  const order = paid();
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
  const first = paid("first@example.invalid"),
    second = paid("second@example.invalid");
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
    const order = paid(mode + "@example.invalid");
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
  const order = paid();
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
  const order = paid();
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
  const order = paid();
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
  const order = paid();
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
  const order = paid();
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
