/** Offline Responses/Structured Outputs contract. Not wired to a live API or worker. */
import { z } from "zod";
import type { Chart } from "../astrology";
import { chapterTitles, validateReport } from "../interpretation";
import { blockedTransport, type Transport } from "./contracts";
const generated = z.object({
  intro: z.string().min(20).max(800),
  chapters: z
    .array(
      z.object({
        title: z.enum(chapterTitles as [string, ...string[]]),
        claimIds: z.array(z.string()).min(1).max(5),
        text: z.string().min(100).max(5000),
      }),
    )
    .length(9),
  notes: z.array(z.string().max(500)).max(10),
});
export function buildAiRequest(chart: Chart, model: string) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(model)) throw Error("MODEL_REQUIRED");
  return {
    model,
    store: false,
    max_output_tokens: 9000,
    instructions:
      "금서태후는 창작 캐릭터다. 품위 있고 따뜻한 한국어 옛말투를 사용한다. 제공된 facts만 근거로 9개 장을 순서대로 작성한다. 계산을 고치거나 새로운 간지·일간·오행 수치를 만들어 내지 않는다. 사망·중병·임신·외도 예언, 공포·열등감 자극, 성공·투자수익 보장을 하지 않는다. 신강·용신은 판단하지 않는다. 시간 미상/제외 항목은 제외 사실을 밝힌다. 자유로운 선택을 존중하고 미래를 확정하지 않는다.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              chapterTitles,
              facts: chart.claims,
              pillars: chart.pillars,
              tenGods: chart.tenGods,
              counts: chart.counts,
              relations: chart.relations,
              cycles: chart.cycles,
              annual: chart.annual,
              monthly: chart.monthly,
              target: chart.target,
              uncertainty: chart.notes,
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "geumseo_report_v1",
        strict: true,
        schema: z.toJSONSchema(generated),
      },
    },
  };
}
export async function offlineAiContract(
  chart: Chart,
  model: string,
  transport: Transport = blockedTransport,
) {
  const raw = (await transport({
    method: "POST",
    path: "/v1/responses",
    headers: { "Content-Type": "application/json" },
    body: buildAiRequest(chart, model),
    timeoutMs: 45000,
  })) as Record<string, any>;
  if (raw.status !== "completed") throw Error("AI_INCOMPLETE_OR_REFUSED");
  const text =
    typeof raw.output_text === "string"
      ? raw.output_text
      : (raw.output || [])
          .filter((x: any) => x.type === "message")
          .flatMap((x: any) => x.content || [])
          .filter((x: any) => x.type === "output_text")
          .map((x: any) => x.text)
          .join("");
  if (text.length > 100000) throw Error("AI_OUTPUT_TOO_LARGE");
  const output = generated.parse(JSON.parse(text));
  // Factual/safety checks supplement schema validation; expert semantic review remains required.
  const allowed = new Set([
    ...chart.pillars.filter(Boolean),
    chart.annual,
    ...chart.monthly.map((m) => m.pillar),
    ...chart.cycles.map((c) => c.pillar),
  ]);
  for (const c of output.chapters) {
    for (const pair of c.text.match(
      /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g,
    ) || [])
      if (!allowed.has(pair)) throw Error("UNSUPPORTED_PILLAR");
    if (/반드시|무조건|죽음|사망|불치|외도 확실|수익 보장/.test(c.text))
      throw Error("UNSAFE_AI_CONTENT");
  }
  return validateReport(
    {
      ...output,
      provider: "openai",
      promptVersion: "taehou-1",
      chart,
      year: chart.target,
      usage: {
        inputTokens: Number(raw.usage?.input_tokens || 0),
        outputTokens: Number(raw.usage?.output_tokens || 0),
        costKrw: null,
      },
    },
    chart,
  );
}
