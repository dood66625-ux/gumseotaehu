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
  promptVersion: z.enum(["taehou-1", "taehou-2"]),
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
  const missing = Object.entries(c.counts)
    .filter(([, n]) => n === 0)
    .map(([e]) => e);
  const balance = missing.length
    ? `${missing.join("·")}이 단순 개수에서 보이지 않는다고 해서 그 기운이 삶에 없다는 뜻은 아니니라. 계절과 지장간, 실제 삶의 맥락을 함께 보아야 하지.`
    : "어느 한 기운의 개수만으로 좋고 나쁨을 가르지 않느니라. 드러난 구성과 실제 생활의 경험을 함께 살펴보거라.";
  const monthActions = [
    "올해 지키고 싶은 기준을 세 가지 적어 보거라.",
    "지금까지 이어온 습관 중 남길 것과 덜어낼 것을 나누어 보거라.",
    "새로운 배움 하나를 작은 실천으로 옮겨 보거라.",
    "가까운 사람과 서로에게 필요한 도움을 구체적으로 이야기해 보거라.",
    "수입보다 먼저 고정 지출과 지킬 예산을 점검해 보거라.",
    "진행 중인 일의 속도와 휴식의 균형을 돌아보거라.",
    "상반기의 선택을 기록하고 하반기의 우선순위를 정해 보거라.",
    "새로운 인연에서는 기대와 경계를 천천히 나누어 보거라.",
    "일의 결과뿐 아니라 배운 과정도 함께 정리해 보거라.",
    "다음 계획을 세우기 전에 지금 가진 자원을 확인해 보거라.",
    "소중한 관계에 감사의 말을 구체적으로 전해 보거라.",
    "한 해의 기록을 돌아보고 그대에게 맞는 리듬을 남겨 보거라.",
  ];
  const texts = [
    `${c.claims[0].text}\n\n사주의 중심을 읽는 일은, 그대가 자신에게 익숙한 방식이 무엇인지 돌아보는 것에서 시작하느니라. ${c.trait} 기질을 하나의 단서로 삼되, 정해진 성격으로 받아들이지는 말거라. 같은 기운도 살아온 환경과 선택에 따라 다른 모습으로 드러날 수 있으니.\n\n${c.claims[1].text} ${balance} 눈에 보이는 숫자는 이야기의 시작이지 그대의 가치를 정하는 점수가 아니니라.`,
    `${c.claims[0].text}\n\n${c.trait} 결은 그대가 편안하게 힘을 쓰는 방식을 돌아보는 말이 될 수 있느니라. 최근 잘 풀렸던 일 세 가지를 떠올려 보거라. 혼자 깊이 생각했을 때였는지, 누군가와 뜻을 나누었을 때였는지, 작은 약속을 끝까지 지켰을 때였는지를.\n\n강점을 찾는 일은 다른 사람보다 앞서는 일을 뜻하지 않느니라. 그대가 덜 소진되면서 꾸준히 이어갈 수 있는 방식을 알아보는 것이지. 급히 결론을 내리기보다 작은 시도와 충분한 휴식을 함께 두거라.`,
    `${c.claims[0].text}\n\n재물의 장에서 먼저 살필 것은 얼마를 얻을 운명인가가 아니라, 그대가 돈을 대할 때 어떤 기준을 쓰는가이니라. ${c.trait} 성향이 실제 소비와 저축의 선택에 어떻게 드러나는지 기록해 보거라. 운세만으로 수익이나 손실을 확정할 수는 없느니라.\n\n한 달의 돈을 생활을 지키는 몫, 미래를 준비하는 몫, 마음을 쉬게 하는 몫으로 나누어 보거라. 큰 결정을 앞두었다면 감당할 수 있는 손실과 필요한 기간을 먼저 확인하거라. 투자는 현실의 정보와 적절한 전문 조언을 함께 검토해야 하느니라.`,
    `${c.claims[0].text}\n\n인연은 어느 날 누가 나타난다는 한 줄의 예언으로 다 담기지 않느니라. ${c.trait} 기질이 관계 안에서 어떤 말과 행동으로 전해지는지 돌아보는 것이 먼저이지. 그대에게 편한 표현이 상대에게도 같은 뜻으로 닿는지는 물어보아야 알 수 있으니.\n\n좋은 관계를 바란다면 원하는 것, 어려운 것, 지키고 싶은 경계를 차분히 나누어 보거라. 답을 짐작하기보다 상대의 말을 듣는 시간을 남겨 두거라. 이 글은 결혼의 시기나 특정인의 마음, 관계의 결과를 확정하지 않느니라.`,
    `${c.claims[0].text}\n\n일의 방향을 살필 때는 직업 이름 하나보다 그 안에서 매일 반복하는 활동을 보거라. ${c.trait} 방식이 배움과 협업, 문제 해결에서 어떻게 쓰이는지 떠올려 보느니라. 익숙한 일을 능숙하게 하는 힘과, 새로운 일을 배우는 힘은 서로 다른 때에 자랄 수 있지.\n\n앞으로 석 달 동안 쌓고 싶은 경험 하나를 정하고, 결과를 확인할 작은 기준을 마련해 보거라. 이직이나 사업은 운세만으로 결정하지 말고 수입·시간·기술·주변의 도움을 함께 점검하거라. 그대의 실제 경험이 가장 중요한 근거이니라.`,
    `${c.claims[1].text}\n\n기운의 구성을 균형이라는 관점에서 읽되, 모든 것을 고르게 맞추어야 한다고 여기지는 말거라. ${balance} 사람을 만나는 일에도 혼자 쉬는 일에도 그대에게 맞는 분량이 있느니라.\n\n이번 주에는 마음이 편해지는 약속과 힘을 지나치게 쓰게 되는 약속을 하나씩 적어 보거라. 거절이 필요한 순간에는 길게 설명하기보다 가능한 범위를 분명히 말해도 좋으니라. 관계를 아끼는 일과 자신을 지키는 일은 함께 갈 수 있느니라.`,
    `${c.claims[0].text}\n\n대운은 전통 명리학에서 긴 시간의 흐름을 살피는 틀이니라. 아래의 구간은 특정 사건이 생긴다는 약속이 아니라, 삶의 긴 주기를 돌아볼 때 쓰는 계산 기록이지. 시작시각과 순역은 출생정보와 선택한 계산 기준에 따라 달라질 수 있느니라.\n\n${c.cycles.length ? c.cycles.map((x) => `${x.startYear}~${x.endYear}년 · ${x.pillar} · 전통식 시작 나이 ${x.age}세`).join("\n") : "출생시각 또는 대운 계산 구분 정보가 충분하지 않아 대운 산출을 제외했느니라. 근거 없이 시작 나이나 흐름을 만들지는 않느니라."}\n\n긴 흐름을 읽더라도 지금의 선택을 미루지는 말거라. 계획의 크기를 조절하고 배움과 휴식의 리듬을 점검하는 참고로 삼으면 좋겠구나.`,
    `${c.claims[2].text}\n\n연도의 기운은 그 해를 돌아보는 전통적인 언어이지, 모든 사람에게 같은 일이 생긴다는 뜻은 아니니라. 각 월의 간지는 양력 15일을 대표 시점으로 삼은 기록이며, 실제 명리월은 절입 시각에 바뀌느니라. 아래의 문장은 사건 예측이 아닌 일상에서 실천할 제안이니라.\n\n${c.monthly.map((m, i) => `${m.month}월 · 대표 명리월 ${m.pillar}\n${monthActions[i]}`).join("\n\n")}`,
    `${c.claims[0].text}\n\n그대의 금서를 덮기 전에 한 가지만 기억하거라. 이 글은 그대의 선택을 대신하는 답이 아니라, 자신을 조금 다른 시선으로 바라보도록 돕는 기록이니라. ${c.trait} 가능성을 일상 속 작은 행동으로 확인해 보거라.\n\n오늘은 남기고 싶은 습관 하나, 쉬어가고 싶은 일 하나, 고마움을 전할 사람 하나를 적어 보거라. 모든 답을 한 번에 얻으려 하지 않아도 좋으니라. 태어난 순간은 이야기의 시작이지만, 다음 장을 써 내려가는 이는 그대 자신이니라.`,
  ];
  const r = {
    provider: "local-rule-mock" as const,
    promptVersion: "taehou-2" as const,
    intro:
      preview(c).intro +
      " 서두르지 말고 한 장씩 읽어 보거라. 그대의 기운을 이해하는 데서 이야기는 시작되느니라.",
    chapters: chapterTitles.map((title, i) => ({
      title,
      claimIds: [c.claims[i === 7 ? 2 : i === 0 || i === 5 ? 1 : 0].id],
      text: texts[i],
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
