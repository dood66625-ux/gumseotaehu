import { it, expect, vi } from "vitest";
import {
  buildAiRequest,
  generateAiReport,
} from "../lib/integrations/ai-contract";
import { aiRequestPolicy } from "../lib/integrations/ai-request-policy";
import {
  createOrderOpenAiTransport,
  approvedOpenAiModel,
} from "../lib/integrations/openai-http";
import { syntheticChart } from "../lib/integrations/ai-synthetic-fixtures";
import { generate } from "../lib/interpretation";
const chart = syntheticChart("known");
it("uses a larger Korean request only on the explicitly selected rich profile", async () => {
  const request = buildAiRequest(
    chart,
    approvedOpenAiModel,
    "ko",
    "rich-ko-v1",
  );
  expect(request.max_output_tokens).toBe(20000);
  expect(
    (request.text.format.schema as any).properties.chapters.items.properties
      .text.minLength,
  ).toBe(700);
  expect(request.instructions).toContain("800~900");
  expect(request.store).toBe(false);
  expect(aiRequestPolicy("rich-ko-v1").timeoutMs).toBe(120000);
  expect(buildAiRequest(chart, approvedOpenAiModel).max_output_tokens).toBe(
    9000,
  );
  expect(() =>
    buildAiRequest(chart, approvedOpenAiModel, "zh-TW", "rich-ko-v1"),
  ).toThrow("KOREAN_ONLY");
  const fetch = vi.fn(async () =>
    Response.json({
      model: approvedOpenAiModel,
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 100 },
    }),
  );
  const transport = createOrderOpenAiTransport({
    chart,
    profile: "rich-ko-v1",
    approval: "customer-data-approved",
    apiKey: "sk-synthetic_existing_key_1234567890",
    reserve() {},
    fetch: fetch as typeof globalThis.fetch,
  });
  await expect(
    transport({
      method: "POST",
      path: "/v1/responses",
      headers: { "Content-Type": "application/json" },
      body: request,
      timeoutMs: 120000,
    }),
  ).resolves.toHaveProperty("status", "completed");
  expect(fetch).toHaveBeenCalledOnce();
});
it("rejects a short paid rich report instead of silently accepting a brief answer", async () => {
  const base = generate(chart);
  for (const c of base.chapters)
    while (c.text.length < 350)
      c.text += " 오늘 할 일 하나부터 차분히 살펴보거라.";
  const output = {
    intro: base.intro,
    chapters: base.chapters,
    notes: chart.notes,
  };
  await expect(
    generateAiReport(
      chart,
      approvedOpenAiModel,
      async () => ({
        status: "completed",
        output_text: JSON.stringify(output),
        usage: { input_tokens: 100, output_tokens: 100 },
      }),
      "ko",
      "rich-ko-v1",
    ),
  ).rejects.toThrow("AI_RICH_CHAPTER_TOO_SHORT");
});
