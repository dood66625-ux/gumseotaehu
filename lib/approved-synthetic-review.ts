/** One explicitly approved synthetic generation, isolated from all customer/historical budgets. */
import type { DatabaseSync } from "node:sqlite";
import { aiSpendLedger } from "./ai-spend-ledger";
import { encryptJson, decryptJson } from "./crypto";
import { generateAiReport, buildAiRequest } from "./integrations/ai-contract";
import {
  aiPricing,
  createSyntheticOpenAiTransport,
  type AiCallTelemetry,
} from "./integrations/openai-http";
import {
  syntheticChart,
  syntheticModel,
} from "./integrations/ai-synthetic-fixtures";
import type { Report } from "./interpretation";
export const reviewApproval = {
  id: "owner-20261122-known-v3-one-call",
  orderId: "f34102ab-a83b-4fdd-b982-9e512462be74",
  budgetUsdMicros: 100000,
} as const;
export const extendedReviewApproval = {
  id: "owner-20261122-known-v3-extended-one-call",
  orderId: "f9d8c2d3-8ab4-45ba-b8ad-27cd6cf6c131",
  budgetUsdMicros: 100000,
} as const;
export async function runApprovedKnownReview(
  db: DatabaseSync,
  key: Buffer,
  apiKey: string,
  send: typeof fetch = fetch,
  variant: "original" | "extended" = "original",
) {
  if (variant !== "original" && variant !== "extended")
    throw Error("APPROVED_REVIEW_VARIANT_REQUIRED");
  const approval =
    variant === "extended" ? extendedReviewApproval : reviewApproval;
  const profile = variant === "extended" ? "synthetic-review-v1" : "standard";
  const chart = syntheticChart("known"),
    request = buildAiRequest(chart, syntheticModel, "ko", profile);
  // Fixed input cap24KB and profile output cap; conservatively use one input token per byte.
  const maximumEstimatedUsdMicros = Math.ceil(
    24000 * aiPricing.inputUsdPerMillion +
      request.max_output_tokens * aiPricing.outputUsdPerMillion,
  );
  if (
    maximumEstimatedUsdMicros > approval.budgetUsdMicros ||
    Buffer.byteLength(JSON.stringify(request)) > 24000
  )
    throw Error("APPROVED_REVIEW_COST_LIMIT");
  const ledger = aiSpendLedger(db, {
    dailyUsdMicros: 100000,
    lifetimeUsdMicros: 100000,
    reservationUsdMicros: 100000,
  });
  db.exec(
    "CREATE TABLE IF NOT EXISTS approved_review(id TEXT PRIMARY KEY,report_enc TEXT NOT NULL);CREATE TABLE IF NOT EXISTS approved_review_response(id TEXT PRIMARY KEY,response_enc TEXT NOT NULL);CREATE TABLE IF NOT EXISTS approved_review_http_trace(client_request_id TEXT PRIMARY KEY,server_request_id TEXT,http_status INTEGER,created INTEGER NOT NULL,headers_received INTEGER)",
  );
  const existing = db
    .prepare("SELECT report_enc FROM approved_review WHERE id=?")
    .get(approval.id);
  if (existing) {
    if (ledger.summary().pending || ledger.summary().uncertain)
      throw Error("APPROVED_REVIEW_REQUIRES_RECONCILIATION");
    return {
      report: decryptJson<Report>(String(existing.report_enc), key),
      newCalls: 0,
      budget: ledger.summary(),
      maximumEstimatedUsdMicros,
    };
  }
  let callId: string | undefined, usage: AiCallTelemetry | undefined;
  try {
    const transport = createSyntheticOpenAiTransport({
      apiKey,
      fixture: "known",
      profile,
      ...(variant === "extended"
        ? { reviewBudgetUsdMicros: 100000 as const }
        : {}),
      approval: "synthetic-only",
      fetch: send,
      reserve() {
        callId = ledger.reserve(approval.orderId, 1);
        db.prepare(
          "INSERT INTO approved_review_http_trace(client_request_id,created) VALUES(?,?)",
        ).run(callId, Date.now());
      },
      clientRequestId() {
        return callId!;
      },
      onResponseHeaders(trace) {
        const changed = db
          .prepare(
            "UPDATE approved_review_http_trace SET server_request_id=?,http_status=?,headers_received=? WHERE client_request_id=?",
          )
          .run(trace.requestId, trace.httpStatus, Date.now(), callId!);
        if (changed.changes !== 1) throw Error("AI_TRACE_RECORD_REQUIRED");
      },
      onUsage(value) {
        usage = value;
        ledger.recordUsage(callId!, value.estimatedUsdMicros);
      },
      onResponse(raw) {
        db.prepare("INSERT INTO approved_review_response VALUES(?,?)").run(
          approval.id,
          encryptJson(raw, key),
        );
      },
    });
    const report = await generateAiReport(
      chart,
      syntheticModel,
      transport,
      "ko",
      profile,
    );
    if (!usage || usage.estimatedUsdMicros > approval.budgetUsdMicros)
      throw Error("APPROVED_REVIEW_USAGE_REQUIRES_REVIEW");
    report.generation = {
      model: syntheticModel,
      pricingVersion: aiPricing.version,
    };
    report.usage.estimatedUsdMicros = usage.estimatedUsdMicros;
    db.prepare("INSERT INTO approved_review VALUES(?,?)").run(
      approval.id,
      encryptJson(report, key),
    );
    ledger.finish(callId!, "completed");
    const saved = decryptJson<Report>(
      String(
        db
          .prepare("SELECT report_enc FROM approved_review WHERE id=?")
          .get(approval.id)!.report_enc,
      ),
      key,
    );
    if (JSON.stringify(saved) !== JSON.stringify(report))
      throw Error("APPROVED_REVIEW_REOPEN_MISMATCH");
    return {
      report: saved,
      newCalls: 1,
      budget: ledger.summary(),
      maximumEstimatedUsdMicros,
    };
  } catch (error) {
    if (
      callId &&
      db
        .prepare("SELECT 1 FROM ai_spend_calls WHERE id=? AND state='reserved'")
        .get(callId)
    )
      ledger.finish(callId, "uncertain");
    throw error;
  }
}
