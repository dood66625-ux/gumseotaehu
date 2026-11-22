import { expect, it, vi, afterEach } from "vitest";
import {
  buildAiRequest,
  generateAiReport,
} from "../lib/integrations/ai-contract";
import { aiRequestPolicy } from "../lib/integrations/ai-request-policy";
import {
  createSyntheticOpenAiTransport,
  createOrderOpenAiTransport,
  aiPricing,
} from "../lib/integrations/openai-http";
import {
  syntheticChart,
  syntheticModel,
} from "../lib/integrations/ai-synthetic-fixtures";
const chart = syntheticChart("known"),
  key = "sk-synthetic_review_profile_credentials";
const profile = "synthetic-review-v1" as const;
function request() {
  return {
    method: "POST" as const,
    path: "/v1/responses",
    headers: { "Content-Type": "application/json" },
    body: buildAiRequest(chart, syntheticModel, "ko", profile),
    timeoutMs: 120000,
  };
}
function response() {
  return Response.json({
    model: syntheticModel,
    status: "completed",
    usage: { input_tokens: 1000, output_tokens: 10000 },
  });
}
afterEach(() => vi.useRealTimers());
it("keeps the operating request unchanged and bounds the separate review profile within its explicit budget", () => {
  const standard = buildAiRequest(chart, syntheticModel),
    review = buildAiRequest(chart, syntheticModel, "ko", profile);
  expect(standard.max_output_tokens).toBe(9000);
  expect(standard).not.toHaveProperty("reasoning");
  expect(aiRequestPolicy()).toMatchObject({ timeoutMs: 45000 });
  expect(review.max_output_tokens).toBe(12000);
  expect(review).toHaveProperty("reasoning.effort", "none");
  expect(review.store).toBe(false);
  expect(
    24000 * aiPricing.inputUsdPerMillion +
      review.max_output_tokens * aiPricing.outputUsdPerMillion,
  ).toBe(72000);
  expect(() => aiRequestPolicy("unreviewed" as any)).toThrow(
    "AI_REQUEST_PROFILE_NOT_APPROVED",
  );
});
it("refuses a review request without a separate budget and prevents it entering the operating transport", async () => {
  const send = vi.fn(async () => response()),
    reserve = vi.fn();
  const unapproved = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    profile,
    apiKey: key,
    reserve,
    fetch: send as typeof fetch,
  });
  await expect(unapproved(request())).rejects.toThrow("NOT_APPROVED");
  expect(reserve).not.toHaveBeenCalled();
  const operating = createOrderOpenAiTransport({
    approval: "customer-data-approved",
    chart,
    apiKey: key,
    reserve,
    fetch: send as typeof fetch,
  });
  await expect(operating(request())).rejects.toThrow(
    "AI_ORDER_REQUEST_MISMATCH",
  );
  expect(send).not.toHaveBeenCalled();
});
it("permits a synthetic response after 60 seconds without extending the operating timeout", async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60000));
    return response();
  });
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    profile,
    reviewBudgetUsdMicros: 100000,
    apiKey: key,
    reserve() {},
    fetch: send as typeof fetch,
  });
  const promise = transport(request());
  await vi.advanceTimersByTimeAsync(60000);
  await expect(promise).resolves.toHaveProperty("status", "completed");
  expect(send).toHaveBeenCalledTimes(1);
});
it("rejects a timeout beyond the review bound before network access", async () => {
  const send = vi.fn(async () => response()),
    reserve = vi.fn();
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    profile,
    reviewBudgetUsdMicros: 100000,
    apiKey: key,
    reserve,
    fetch: send as typeof fetch,
  });
  await expect(transport({ ...request(), timeoutMs: 120001 })).rejects.toThrow(
    "AI_INVALID_TIMEOUT",
  );
  expect(send).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});
it("classifies explicit output exhaustion without claiming that a missing response hit this limit", async () => {
  await expect(
    generateAiReport(
      chart,
      syntheticModel,
      async () => ({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
      "ko",
      profile,
    ),
  ).rejects.toThrow("AI_OUTPUT_LIMIT_REACHED");
  await expect(
    generateAiReport(
      chart,
      syntheticModel,
      async () => ({ status: "incomplete" }),
      "ko",
      profile,
    ),
  ).rejects.toThrow("AI_INCOMPLETE_OR_REFUSED");
});
