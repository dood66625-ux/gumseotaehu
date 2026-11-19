import { it, expect } from "vitest";
import { calculate, type Birth, type Chart } from "../lib/astrology";
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
function validAiFixture(chart: Chart) {
  const report = generate(chart);
  for (const chapter of report.chapters)
    while (chapter.text.length < 350)
      chapter.text +=
        " 일상의 기록을 돌아보고 오늘 실천할 작은 선택을 정해 보거라.";
  return report;
}
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
    r = validAiFixture(c),
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
  const r = validAiFixture(c);
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
    r = validAiFixture(c);
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
it("rejects refusal content even alongside a completed status and valid text", async () => {
  const c = calculate(b),
    r = validAiFixture(c);
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "No" }] },
      ],
    })),
  ).rejects.toThrow("AI_INCOMPLETE_OR_REFUSED");
});
it("checks unsafe intro and fabricated pillars in notes as well as chapters", async () => {
  const c = calculate(b);
  for (const field of ["intro", "notes"]) {
    const r = validAiFixture(c);
    if (field === "intro") r.intro += " 반드시 성공하리라.";
    else r.notes.push("확인되지 않은 甲子의 흐름이 온다.");
    if (field === "notes" && JSON.stringify(c).includes("甲子")) continue;
    await expect(
      offlineAiContract(c, "owner-selected-model", async () => ({
        status: "completed",
        output_text: JSON.stringify(r),
      })),
    ).rejects.toThrow();
  }
});
it("rejects a nine-chapter report that omits monthly guidance", async () => {
  const c = calculate(b),
    r = validAiFixture(c);
  r.chapters[7].text =
    c.claims[2].text +
    "\n1월에는 차분한 기록을 남기고 일상을 살펴보거라. ".repeat(20);
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
    })),
  ).rejects.toThrow("AI_MONTH_COVERAGE_MISSING");
});
it("requires evidence suited to each chapter, not just any valid claim ID", async () => {
  const c = calculate(b),
    r = validAiFixture(c);
  r.chapters[7].claimIds = [c.claims[0].id];
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
    })),
  ).rejects.toThrow("AI_CHAPTER_EVIDENCE_MISSING");
});

it("rejects underlength chapters even when their facts and JSON structure are valid", async () => {
  const c = calculate(b),
    r = validAiFixture(c);
  r.chapters[0].text = r.chapters[0].text.slice(0, 250);
  await expect(
    offlineAiContract(c, "owner-selected-model", async () => ({
      status: "completed",
      output_text: JSON.stringify(r),
    })),
  ).rejects.toThrow("AI_INVALID_REPORT_SHAPE");
});

it("Traditional Chinese reports preserve monthly coverage and reject contradictory day/element facts", async () => {
  const chart = calculate(b),
    base = validAiFixture(chart);
  base.intro = `本宮見你的日主為${chart.day}，且循命盤所見，陪你慢慢梳理心中掛念之事。`;
  base.chapters.forEach((chapter, index) => {
    chapter.text =
      `第${index + 1}篇。` +
      "且先觀照日常的選擇，不急於替未來下結論，願你在閱讀後找到一項可以實踐的小事。".repeat(
        12,
      );
  });
  base.chapters[7].text += Array.from(
    { length: 12 },
    (_, i) => `${i + 1}月，留意生活的節奏。`,
  ).join(" ");
  const invoke = (value: any) =>
    offlineAiContract(
      chart,
      "model",
      async () => ({ status: "completed", output_text: JSON.stringify(value) }),
      "zh-TW",
    );
  expect((await invoke(base)).promptVersion).toBe("taehou-ai-3-zh-TW");
  await expect(
    invoke({
      ...base,
      intro: `日主為${chart.day === "甲" ? "乙" : "甲"}。` + base.intro,
    }),
  ).rejects.toThrow("DAY_FACT_MISMATCH");
  const wrong = structuredClone(base);
  wrong.chapters[0].text += ` 木${chart.counts.목 + 1}、`;
  await expect(invoke(wrong)).rejects.toThrow("COUNT_FACT_MISMATCH");
});
