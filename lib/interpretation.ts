import { z } from "zod";
import type { Chart } from "./astrology";
export const chapterTitles = [
  "사주 구조와 오행",
  "타고난 성향",
  "재물과 선택",
  "연애와 인연",
  "직업과 성장",
  "관계와 균형",
  "대운의 흐름",
  "연간·월별 흐름",
  "그대를 위한 조언",
];
const section = z.object({
  title: z.string().min(2).max(50),
  claimIds: z.array(z.string()).min(1),
  text: z.string().min(40).max(3000),
});
export const reportSchema = z.object({
  provider: z.enum(["local-rule-mock", "openai"]),
  promptVersion: z.literal("taehou-1"),
  intro: z.string().min(20),
  chapters: z.array(section).length(9),
  notes: z.array(z.string()),
  chart: z.custom<Chart>(),
  year: z.number(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    costKrw: z.number().nullable(),
  }),
});
export type Report = z.infer<typeof reportSchema>;
export function preview(c: Chart) {
  return {
    intro: `호오, 그대의 ${c.day} 일간에는 ${c.trait} 결이 담겨 있구나.`,
    cards: [
      {
        title: "그대의 중심",
        claimIds: [c.claims[0].id],
        text: `${c.claims[0].text} 전통적인 해석에서는 ${c.trait} 성향을 돌아보는 단서로 삼느니라. 정해진 성격이 아니라 그대를 이해하는 하나의 관점이지.`,
      },
      {
        title: "기운의 구성",
        claimIds: [c.claims[1].id],
        text: `${c.claims[1].text} 이 구성에서 ${c.dominant}의 개수가 눈에 띄는구나. 많고 적음을 좋고 나쁨으로 나누지 말고, 일상의 균형을 살펴보거라.`,
      },
    ],
    bridge: `${c.element}의 결을 살펴보았느니라. ${c.target}년 ${c.annual}의 흐름 속에서 일과 관계를 어떻게 가꾸어 갈지, 다음 장에서 함께 살펴보겠느냐?`,
  };
}
export function generate(c: Chart): Report {
  const tips = [
    "기록을 통해 자신의 선택 기준을 살펴보거라.",
    "한 번에 결론내리기보다 작은 실험과 충분한 휴식을 권하느니라.",
    "소득과 지출을 적고 감당 가능한 예산을 정해 보거라. 투자 수익은 운세로 보장할 수 없느니라.",
    "상대의 마음을 짐작하기보다 원하는 것과 경계를 차분하게 말해 보거라. 인연의 시기나 결혼을 확정하지 않느니라.",
    "배움의 목표를 작게 나누고 실제 경험과 피드백을 쌓아 보거라. 이직·사업은 현실의 조건을 함께 검토해야 하느니라.",
    "관계에서 지킬 약속과 나를 위한 시간을 함께 정해 보거라. 타인에 대한 단정은 경계하느니라.",
    "대운은 전통적 주기 해석의 틀이며 사건을 예언하는 표가 아니니라. 시작시각은 출생시각과 학파에 따라 달라지느니라.",
    "월별 표는 각 양력 월 15일 대표 명리월이며 절입 시각을 경계로 바뀌니라. 달 전체가 같은 명리월이라는 뜻은 아니니라.",
    "그대의 선택은 그대에게 있느니라. 이 글은 전통 해석 관점의 참고이며 의료·법률·투자 조언을 대신하지 않느니라.",
  ];
  const r = {
    provider: "local-rule-mock" as const,
    promptVersion: "taehou-1" as const,
    intro:
      preview(c).intro +
      " 이 운명서는 로컬 규칙 기반 시험 콘텐츠이며 실제 AI가 작성하지 않았느니라.",
    chapters: chapterTitles.map((title, i) => ({
      title,
      claimIds: [c.claims[i === 7 ? 2 : i === 0 ? 1 : 0].id],
      text: `${c.claims[i === 7 ? 2 : i === 0 ? 1 : 0].text}\n\n${c.trait} 기운을 바탕으로 다음을 돌아볼 수 있느니라. ${tips[i]}${i === 6 ? "\n\n" + (c.cycles.length ? c.cycles.map((x) => `${x.startYear}~${x.endYear}년 ${x.pillar} (전통식 시작 나이 ${x.age}세)`).join("\n") : "출생시각 또는 계산 구분 정보가 없어 대운 산출을 제외했느니라.") : ""}${i === 7 ? "\n\n" + c.monthly.map((x) => `${x.month}월 대표 명리월: ${x.pillar} — 계획을 점검하고 생활의 균형을 살펴보거라.`).join("\n") : ""}`,
    })),
    notes: c.notes,
    chart: c,
    year: c.target,
    usage: { inputTokens: 0, outputTokens: 0, costKrw: 0 },
  };
  return validateReport(r, c);
}
export function validateReport(raw: unknown, c: Chart) {
  const r = reportSchema.parse(raw);
  const ids = new Set(c.claims.map((x) => x.id));
  if (JSON.stringify(r.chart) !== JSON.stringify(c))
    throw Error("CHART_CHANGED");
  r.chapters.forEach((s, i) => {
    if (s.title !== chapterTitles[i] || s.claimIds.some((x) => !ids.has(x)))
      throw Error("UNSUPPORTED_FACT");
    if (/반드시 성공|죽을|불치|외도 확실|무조건 부자/.test(s.text))
      throw Error("UNSAFE_CONTENT");
  });
  return r;
}
