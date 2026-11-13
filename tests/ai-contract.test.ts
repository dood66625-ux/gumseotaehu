import { it, expect } from "vitest";
import { calculate, type Birth } from "../lib/astrology";
import { generate } from "../lib/interpretation";
import {
  buildAiRequest,
  offlineAiContract,
} from "../lib/integrations/ai-contract";
const b: Birth = {
  name: "개인별명",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: null,
  sex: "unspecified",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
// config is loaded from ignored local file created by setup; no external call occurs.
it("Responses request excludes raw birthdate/email/name and requests strict structured output without storage", () => {
  const c = calculate(b),
    r = buildAiRequest(c, "owner-selected-model");
  expect(JSON.stringify(r)).not.toContain(b.date);
  expect(JSON.stringify(r)).not.toContain(b.name);
  expect(r.store).toBe(false);
  expect(r.text.format.strict).toBe(true);
  expect(r.max_output_tokens).toBe(9000);
});
it("default network transport is blocked", async () => {
  await expect(
    offlineAiContract(calculate(b), "owner-selected-model"),
  ).rejects.toThrow("NOT_APPROVED");
});
it("parses completed offline response, validates facts and preserves source chart", async () => {
  const c = calculate(b),
    r = generate(c),
    data = {
      intro: r.intro,
      chapters: r.chapters.map((x) => ({
        ...x,
        text: x.text + " 차분한 기록과 선택을 위한 참고로 활용해 보거라.",
      })),
      notes: c.notes,
    };
  const result = await offlineAiContract(
    c,
    "owner-selected-model",
    async () => ({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(data) }],
        },
      ],
      usage: { input_tokens: 200, output_tokens: 500 },
    }),
  );
  expect(result.chart).toEqual(c);
  expect(result.provider).toBe("openai");
  expect(result.usage.outputTokens).toBe(500);
});
it("rejects refusal, malformed JSON and unknown facts", async () => {
  const c = calculate(b);
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "incomplete",
    })),
  ).rejects.toThrow();
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: "not json",
    })),
  ).rejects.toThrow();
  const r = generate(c);
  r.chapters[0].claimIds = ["UNKNOWN"];
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
    })),
  ).rejects.toThrow();
});
it("rejects definitive unsafe narrative even when schema-valid", async () => {
  const c = calculate(b),
    r = generate(c);
  r.chapters.forEach((x) => {
    x.text += " 차분한 기록과 선택을 위한 참고로 활용해 보거라.";
  });
  r.chapters[0].text += " 반드시 성공한다고 단언한다.";
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
    })),
  ).rejects.toThrow("UNSAFE_AI_CONTENT");
});
it("propagates API quota/rate/timeout failures for durable worker retry", async () => {
  for (const e of ["429", "500", "TIMEOUT"])
    await expect(
      offlineAiContract(calculate(b), "owner-selected-model", async () => {
        throw Error(e);
      }),
    ).rejects.toThrow(e);
});
