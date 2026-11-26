import { config } from "./config";
import { db } from "./db";
import { aiSpendLedger, type AiSpendPolicy } from "./ai-spend-ledger";
import { readAiWorkerEnrollment } from "./ai-worker-enrollment";
import { runAiWorkerCycle, inspectAiWorkerQueue } from "./ai-worker-cycle";
import { runOrderOpenAiJob } from "./ai-order-runner";
export function configuredAiPolicy(): AiSpendPolicy {
  const amount = (name: string) => {
    const value = process.env[name] ?? "";
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw Error("AI_BUDGET_CONFIG_REQUIRED");
    return Number(value);
  };
  return {
    dailyUsdMicros: amount("AI_DAILY_USD_MICROS"),
    lifetimeUsdMicros: amount("AI_LIFETIME_USD_MICROS"),
    reservationUsdMicros: amount("AI_RESERVATION_USD_MICROS"),
  };
}
export function aiEnrollmentOptions() {
  const cfg = config();
  if (!cfg.origin.startsWith("https://")) throw Error("AI_HTTPS_REQUIRED");
  const file = process.env.AI_CUTOVER_FILE;
  if (!file) throw Error("AI_CUTOVER_FILE_REQUIRED");
  return {
    policy: configuredAiPolicy(),
    origin: cfg.origin,
    key: cfg.key,
    file,
  };
}
export async function runConfiguredAiCycle(
  options: { fetch?: typeof fetch; stopping?: () => boolean } = {},
) {
  const mode = process.env.AI_WORKER_MODE;
  if (!mode || mode === "disabled")
    return { state: "disabled" as const, processed: 0 };
  if (mode !== "openai") throw Error("INVALID_AI_WORKER_MODE");
  if (process.env.CUSTOMER_AI_APPROVAL !== "customer-data-approved")
    throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
  const setup = aiEnrollmentOptions(),
    database = db();
  const cutoff = readAiWorkerEnrollment(database, setup).createdAtOrAfter;
  const ready = inspectAiWorkerQueue(database, setup.policy, 1, cutoff);
  if (ready.state === "blocked") return { ...ready, processed: 0 };
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key))
    throw Error("AI_CREDENTIAL_REQUIRED");
  const profile = process.env.AI_REPORT_PROFILE ?? "standard";
  if (profile !== "standard" && profile !== "rich-ko-v1")
    throw Error("AI_ORDER_PROFILE_NOT_APPROVED");
  const ledger = aiSpendLedger(database, setup.policy);
  return runAiWorkerCycle(database, {
    enabled: true,
    policy: setup.policy,
    createdAtOrAfter: cutoff,
    stopping: options.stopping,
    runJob: async (orderId) => {
      // Recheck the hold and signed binding before every network-capable job.
      readAiWorkerEnrollment(database, setup);
      return runOrderOpenAiJob({
        enabled: true,
        approval: "customer-data-approved",
        orderId,
        ledger,
        apiKey: key,
        profile,
        fetch: options.fetch,
      });
    },
  });
}
