/** Explicitly injected, inactive candidate. No provider transport or normal-worker registration. */
import type { Chart } from "./astrology";
import type { aiSpendLedger } from "./ai-spend-ledger";
import { validateReport, type Report } from "./interpretation";
import { workOnceWithGenerator } from "./service";
export async function runBudgetedAiJob(options: {
  enabled?: boolean;
  orderId: string;
  ledger: ReturnType<typeof aiSpendLedger>;
  generate: (
    chart: Chart,
    recordUsage: (estimatedUsdMicros: number) => void,
  ) => Promise<Report>;
}) {
  // Explicit per-order selection prevents a future opt-in from draining historical queues.
  if (options.enabled !== true) return false;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      options.orderId,
    )
  )
    throw Error("AI_EXPLICIT_ORDER_REQUIRED");
  return workOnceWithGenerator(
    async (chart, context) => {
      const reservation = options.ledger.reserve(
        context.orderId,
        context.version,
      );
      let recordedCost: number | null = null;
      try {
        const report = await options.generate(chart, (amount) => {
          options.ledger.recordUsage(reservation, amount);
          recordedCost = Math.max(recordedCost ?? 0, amount);
        });
        if (recordedCost === null) throw Error("AI_DURABLE_USAGE_REQUIRED");
        if (report.provider !== "openai") throw Error("AI_PROVIDER_MISMATCH");
        const validated = validateReport(report, chart);
        if (
          validated.usage.estimatedUsdMicros !== undefined &&
          validated.usage.estimatedUsdMicros !== recordedCost
        )
          throw Error("AI_REPORTED_USAGE_MISMATCH");
        validated.usage.estimatedUsdMicros = recordedCost;
        options.ledger.finish(reservation, "completed");
        return validated;
      } catch (error) {
        // Keep the reservation even for invalid output, missing usage, or a lost response.
        options.ledger.finish(reservation, "uncertain");
        throw error;
      }
    },
    options.orderId,
    "openai",
  );
}
