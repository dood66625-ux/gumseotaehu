import { aiRequestPolicy, type AiGenerationProfile } from "./ai-request-policy";
/** Shared Responses/Structured Outputs contract. Network defaults to blocked. */
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
        text: z.string().min(350).max(3000),
      }),
    )
    .length(9),
  notes: z.array(z.string().max(500)).max(10),
});
export function buildAiRequest(
  chart: Chart,
  model: string,
  locale: "ko" | "zh-TW" = "ko",
  profile: AiGenerationProfile = "standard",
) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(model)) throw Error("MODEL_REQUIRED");
  const request = {
    model,
    store: false,
    max_output_tokens: aiRequestPolicy(profile).maxOutputTokens,
    ...(profile === "synthetic-review-v1" || profile === "rich-ko-v1"
      ? { reasoning: { effort: "none" as const } }
      : {}),
    instructions:
      "금서태후는 창작 캐릭터다. 중국 태후를 모티프로 한 인물로서 품위 있고 따뜻한 한국어 옛말투를 사용한다. 독자를 그대라 부르고, 해석 본문과 intro의 문장은 ~하거라, ~보거라, ~이니라, ~느니라, ~구나, ~느냐 등을 자연스럽게 섞어 끝맺는다. 현대 설명서 말투인 ~합니다, ~입니다, ~하세요, ~해요를 해석 문장의 끝맺음으로 사용하지 않는다. 쉬운 단어로 직접 말을 건네되 모든 문장을 명령형이나 질문형으로 만들지 않는다. 예: 마음이 서두르느냐? 오늘 할 일 하나부터 차분히 골라 보거라. uncertainty의 원문 보존 규칙은 말투보다 우선하며 notes는 바꾸지 않는다. 제공된 facts만 근거로 9개 장을 순서대로 작성한다. 계산을 고치거나 새로운 간지·일간·오행 수치를 만들어 내지 않는다. 사망·중병·임신·외도 예언, 공포·열등감 자극, 성공·투자수익 보장을 하지 않는다. 신강·용신은 판단하지 않는다. 시간 미상/제외 항목은 제외 사실을 밝힌다. uncertainty 문장은 notes에 원문 그대로 모두 유지한다. 자유로운 선택을 존중하고 미래를 확정하지 않는다. 각 장은 350~650자의 고유한 해석과 실천 제안을 포함한다. 금칙어인 반드시, 무조건, 죽음, 사망, 불치, 외도 확실, 수익 보장은 부정문이나 주의문에서도 그대로 쓰지 않는다. 대신 결과를 단정할 수 없다는 식으로 표현한다. intro는 일간과 그 결에 대한 첫 반응을 담는다. chapterTitles 순서와 제목을 정확히 지키고 claimIds에는 해당 장과 관련된 facts의 id만 사용한다. 1장은 일간과 오행 개수 근거 모두, 2·3·5장은 TEN_GODS, 4·6장은 RELATIONS, 7장은 CYCLES, 8장은 MONTHS, 9장은 일간 근거 id를 포함한다. 7장은 제공된 대운만 설명하며 미산출일 때 이유를 밝힌다. 8장은 제공된 12개 월을 빠짐없이 각각 구분하고 월별 제안을 작성한다. 간지와 오행 수치는 직접 재계산하거나 추측하지 않는다.",
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
  if (profile === "rich-ko-v1") {
    if (locale !== "ko") throw Error("AI_RICH_KOREAN_ONLY");
    request.instructions = request.instructions.replace(
      "각 장은 350~650자의 고유한 해석과 실천 제안을 포함한다.",
      "각 장은 800~1000자의 고유한 해석과 실천 제안을 포함한다. 분량을 채우기 위한 같은 말 반복은 피한다. 주어진 근거를 쉬운 말로 풀고, 생활 속 사례와 실천할 행동을 구체적으로 설명한다. 12살 독자도 알아들을 쉬운 표현을 사용하고 어려운 용어를 쓰면 바로 설명한다.",
    );
  }
  if (locale === "zh-TW")
    request.instructions =
      "你是中國太后意象的虛構人物禁書太后。所有 intro 與章節正文只用臺灣繁體中文，語氣典雅溫暖，以本宮、你、且看、不妨等自然說話，不恐嚇、不命令讀者。每章至少350字，保留既定韓文章節標題供系統識別，正文不要使用韓文。notes 的原始不確定性說明必須逐字保留，即使原文為韓文。不得改動命盤、日主、干支或五行數量；不斷言強弱、用神、健康、死亡、感情背叛或投資結果。未知出生時辰不補造時柱或大運。禁止使用必定成功、保證獲利、必死、絕症、一定會出軌等詞，包括否定句。按所附 facts 寫九章，claimIds 沿用原值，第一章涵蓋日主和五行，第二三五章含TEN_GODS，第四六章含RELATIONS，第七章含CYCLES，第八章含MONTHS並逐一列出1月到12月的建議，第九章含日主。";
  return request;
}
export async function generateAiReport(
  chart: Chart,
  model: string,
  transport: Transport = blockedTransport,
  locale: "ko" | "zh-TW" = "ko",
  profile: AiGenerationProfile = "standard",
) {
  const raw = (await transport({
    method: "POST",
    path: "/v1/responses",
    headers: { "Content-Type": "application/json" },
    body: buildAiRequest(chart, model, locale, profile),
    timeoutMs: aiRequestPolicy(profile).timeoutMs,
  })) as Record<string, any>;
  if (
    raw?.status === "incomplete" &&
    raw.incomplete_details?.reason === "max_output_tokens"
  )
    throw Error("AI_OUTPUT_LIMIT_REACHED");
  if (!raw || typeof raw !== "object" || raw.status !== "completed")
    throw Error("AI_INCOMPLETE_OR_REFUSED");
  if (
    Array.isArray(raw.output) &&
    raw.output.some(
      (item: any) =>
        item?.type === "message" &&
        (item.status === "incomplete" ||
          (Array.isArray(item.content) &&
            item.content.some((part: any) => part?.type === "refusal"))),
    )
  )
    throw Error("AI_INCOMPLETE_OR_REFUSED");
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
  let output: z.infer<typeof generated>;
  try {
    output = generated.parse(JSON.parse(text));
  } catch {
    throw Error("AI_INVALID_REPORT_SHAPE");
  }
  if (
    profile === "rich-ko-v1" &&
    output.chapters.some((c) => c.text.length < 700)
  )
    throw Error("AI_RICH_CHAPTER_TOO_SHORT");
  // Factual/safety checks supplement schema validation; expert semantic review remains required.
  const allowed = new Set([
    ...chart.pillars.filter(Boolean),
    chart.annual,
    ...chart.monthly.map((m) => m.pillar),
    ...chart.cycles.map((c) => c.pillar),
  ]);
  for (const text of [
    output.intro,
    ...output.chapters.map((c) => c.text),
    ...output.notes,
  ]) {
    for (const pair of text.match(
      /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g,
    ) || [])
      if (!allowed.has(pair)) throw Error("UNSUPPORTED_PILLAR");
    if (locale === "zh-TW") {
      for (const match of text.matchAll(
        /日主(?:為|是|：|:)?\s*([甲乙丙丁戊己庚辛壬癸])/g,
      ))
        if (match[1] !== chart.day) throw Error("DAY_FACT_MISMATCH");
      const elementNames: Record<string, string> = {
        木: "목",
        火: "화",
        土: "토",
        金: "금",
        水: "수",
      };
      for (const match of text.matchAll(
        /([木火土金水])\s*(\d+)(?=[、，,。\s]|$)/g,
      ))
        if (Number(match[2]) !== chart.counts[elementNames[match[1]]])
          throw Error("COUNT_FACT_MISMATCH");
    }
    if (
      /반드시|무조건|죽음|사망|불치|외도 확실|수익 보장|必定成功|保證獲利|必死|絕症|一定會出軌/.test(
        text,
      )
    )
      throw Error("UNSAFE_AI_CONTENT");
  }
  const required = [
    [chart.claims[0].id, chart.claims[1].id],
    ["TEN_GODS"],
    ["TEN_GODS"],
    ["RELATIONS"],
    ["TEN_GODS"],
    ["RELATIONS"],
    ["CYCLES"],
    ["MONTHS"],
    [chart.claims[0].id],
  ];
  output.chapters.forEach((chapter, index) => {
    if (required[index].some((id) => !chapter.claimIds.includes(id)))
      throw Error("AI_CHAPTER_EVIDENCE_MISSING");
  });
  if (
    locale === "zh-TW" &&
    /[가-힣]/.test(output.intro + output.chapters.map((c) => c.text).join(""))
  )
    throw Error("AI_LANGUAGE_MISMATCH");
  for (let month = 1; month <= 12; month++)
    if (
      !new RegExp(
        "(?:^|[^0-9])" +
          month +
          (locale === "zh-TW" ? "月" : "월") +
          "(?:[^0-9]|$)",
      ).test(output.chapters[7].text)
    )
      throw Error("AI_MONTH_COVERAGE_MISSING");
  return validateReport(
    {
      ...output,
      provider: "openai",
      promptVersion: locale === "zh-TW" ? "taehou-ai-3-zh-TW" : "taehou-ai-3",
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

/** Backward-compatible name for offline injected contract tests. */
export const offlineAiContract = generateAiReport;
