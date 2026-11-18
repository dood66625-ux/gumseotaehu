/** Opt-in per-order orchestration. Not registered in any public route or general worker. */
import { runBudgetedAiJob } from "./ai-generation-worker";
import type { aiSpendLedger } from "./ai-spend-ledger";
import { generateAiReport } from "./integrations/ai-contract";
import {
  aiPricing,
  approvedOpenAiModel,
  createOrderOpenAiTransport,
} from "./integrations/openai-http";
export async function runOrderOpenAiJob(options: {
  enabled?: boolean;
  approval?: "customer-data-approved";
  orderId: string;
  ledger: ReturnType<typeof aiSpendLedger>;
  apiKey: string;
  fetch?: typeof fetch;
}) {
  if (options.enabled !== true) return false;
  // Reject prior to claiming a job or reserving costs. No environment variable enables this.
  if (options.approval !== "customer-data-approved")
    throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(options.apiKey))
    throw Error("AI_CREDENTIAL_REQUIRED");
  return runBudgetedAiJob({
    enabled: true,
    orderId: options.orderId,
    ledger: options.ledger,
    async generate(chart, recordUsage) {
      const transport = createOrderOpenAiTransport({
        approval: options.approval,
        chart,
        apiKey: options.apiKey,
        fetch: options.fetch,
        // Outer orchestration already committed the reservation before entering this generator.
        reserve() {},
        onUsage(usage) {
          recordUsage(usage.estimatedUsdMicros);
        },
      });
      const report = await generateAiReport(
        chart,
        approvedOpenAiModel,
        transport,
      );
      report.generation = {
        model: approvedOpenAiModel,
        pricingVersion: aiPricing.version,
      };
      return report;
    },
  });
}
