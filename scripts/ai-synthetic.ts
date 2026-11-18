import { PRODUCT_PRICE_KRW } from "../lib/product";
/** Explicit real API smoke test; fixed invented inputs + separate DB; never a public route. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import {
  syntheticBirths,
  syntheticChart,
  syntheticModel,
  type SyntheticFixture,
} from "../lib/integrations/ai-synthetic-fixtures";
import { generateAiReport } from "../lib/integrations/ai-contract";
import {
  AiHttpError,
  aiPricing,
  createSyntheticOpenAiTransport,
  type AiCallTelemetry,
} from "../lib/integrations/openai-http";
import { openSyntheticBudget } from "../lib/ai-synthetic-budget";
import { reportPdf } from "../lib/pdf";
import * as svc from "../lib/service";
import { one, closeDb } from "../lib/db";
import { config } from "../lib/config";
import { encryptJson } from "../lib/crypto";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
if (
  ![2, 3].includes(args.length) ||
  (args.length === 3 &&
    (args[2] !== "--funded-resume" || args[1] !== "unknown")) ||
  args[0] !== "--live" ||
  !["known", "unknown"].includes(args[1])
) {
  console.error(
    "Usage: npm run ai:synthetic -- --live known|unknown (fixed synthetic data only; base 3 calls, one funded-resume slot)",
  );
  process.exit(1);
}
const fixture = args[1] as SyntheticFixture;
// Always overrides DB to a dedicated local file before any config/db access.
process.env.DATABASE_PATH = "./var/ai-synthetic/journey.sqlite";
let budget: ReturnType<typeof openSyntheticBudget> | undefined;
try {
  const cfg = config();
  if (resolve(cfg.db) !== resolve("var/ai-synthetic/journey.sqlite"))
    throw Error("SYNTHETIC_DATABASE_REQUIRED");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Error("AI_CREDENTIAL_REQUIRED");
  mkdirSync("var/ai-synthetic", { recursive: true, mode: 0o700 });
  budget = openSyntheticBudget("var/ai-synthetic/budget.sqlite", {
    fundedResume: args[2] === "--funded-resume",
  });
  const before = Number(budget.summary().calls);
  const { session: initial } = svc.newSession();
  const challenge = svc.requestOtp(
    initial,
    `synthetic-${fixture}@example.invalid`,
  );
  svc.verifyOtp(initial, challenge, svc.localOtp(initial, challenge).code);
  const session = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    initial.id,
  )!;
  let order = svc.listOrders(session)[0];
  if (!order) {
    const readingId = svc.makeReading(session, syntheticBirths[fixture]);
    const id = svc.createOrder(session, readingId, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    });
    const paymentKey = svc.mockAuthenticate(session, id);
    svc.confirmPayment(session, id, paymentKey, PRODUCT_PRICE_KRW);
    order = svc.listOrders(session)[0];
  }
  let failure: string | null = null;
  if (order.fulfillment !== "ready") {
    await svc.workOnceWithGenerator(async (chart) => {
      if (!isDeepStrictEqual(chart, syntheticChart(fixture)))
        throw Error("SYNTHETIC_CHART_MISMATCH");
      let callId: string | undefined;
      let usage: AiCallTelemetry | undefined;
      try {
        const transport = createSyntheticOpenAiTransport({
          approval: "synthetic-only",
          fixture,
          apiKey: key,
          reserve() {
            callId = budget!.reserve();
          },
          onResponse(raw) {
            if (!callId) throw Error("AI_CALL_RECORD_REQUIRED");
            writeFileSync(
              `var/ai-synthetic/${fixture}-${callId}-response.enc`,
              encryptJson(raw, cfg.key),
              { mode: 0o600, flag: "wx" },
            );
          },
          onUsage(data) {
            usage = data;
            budget!.usage(callId!, data);
          },
        });
        const report = await generateAiReport(chart, syntheticModel, transport);
        if (!usage) throw Error("AI_USAGE_REQUIRED");
        report.generation = {
          model: syntheticModel,
          pricingVersion: aiPricing.version,
        };
        report.usage.estimatedUsdMicros = usage.estimatedUsdMicros;
        budget!.finish(callId!, "completed");
        return report;
      } catch (error) {
        failure =
          error instanceof AiHttpError
            ? error.code
            : error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)
              ? error.message
              : "AI_VALIDATION_FAILED";
        if (callId)
          budget!.finish(
            callId,
            failure.includes("UNCERTAIN") ? "uncertain" : "failed",
            failure,
          );
        throw Error(failure);
      }
    }, order.id);
  }
  if (failure) throw Error(failure);
  const first = svc.getReport(session, order.id);
  const again = svc.getReport(session, order.id);
  if (
    first.report.provider !== "openai" ||
    !isDeepStrictEqual(first.report.chart, syntheticChart(fixture)) ||
    !isDeepStrictEqual(first.report, again.report)
  )
    throw Error("SYNTHETIC_REOPEN_MISMATCH");
  const pdf = await reportPdf(first);
  if (pdf.subarray(0, 5).toString() !== "%PDF-")
    throw Error("SYNTHETIC_PDF_INVALID");
  writeFileSync(`var/ai-synthetic/${fixture}-report.pdf`, pdf, { mode: 0o600 });
  const evidence = {
    fixture,
    provider: first.report.provider,
    model: first.report.generation?.model,
    reportId: first.id,
    orderId: order.id,
    chapterCharacters: first.report.chapters.map((c) => c.text.length),
    meetsCurrentMinimumLength: first.report.chapters.every(
      (c) => c.text.length >= 350,
    ),
    chapters: first.report.chapters.length,
    reportDigest: createHash("sha256")
      .update(JSON.stringify(first.report))
      .digest("hex"),
    persistedReopenMatches: true,
    apiCallsThisRun: Number(budget.summary().calls) - before,
    usage: first.report.usage,
    budget: budget.summary(),
    pdfBytes: pdf.length,
    livePayments: false,
    realMail: false,
    customerDataTransmitted: false,
    publicDeployment: false,
  };
  writeFileSync(
    `var/ai-synthetic/${fixture}-evidence.json`,
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)
      ? error.message
      : "AI_SYNTHETIC_CHECK_FAILED";
  console.error(
    JSON.stringify({
      success: false,
      code,
      budget: budget?.summary(),
      secretValuesSuppressed: true,
    }),
  );
  process.exitCode = 1;
} finally {
  closeDb();
  budget?.close();
}
