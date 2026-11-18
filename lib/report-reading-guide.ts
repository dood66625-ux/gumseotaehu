import type { Report } from "./interpretation";
const elements = {
  목: {
    key: "wood",
    name: "나무",
    meaning: "자라나고 새로운 방향을 찾아가는 모습",
    action: "배우고 싶은 것을 하나 골라 작게 시작해 보세요.",
  },
  화: {
    key: "fire",
    name: "불",
    meaning: "마음을 표현하고 주변과 온기를 나누는 모습",
    action: "전하고 싶은 마음을 짧고 구체적인 말로 표현해 보세요.",
  },
  토: {
    key: "earth",
    name: "흙",
    meaning: "기반을 다지고 꾸준하게 쌓아가는 모습",
    action: "지킬 수 있는 작은 일과를 하나 정해 보세요.",
  },
  금: {
    key: "metal",
    name: "금속",
    meaning: "기준을 세우고 필요한 것을 골라내는 모습",
    action: "지금 중요한 일과 내려놓아도 되는 일을 나눠 보세요.",
  },
  수: {
    key: "water",
    name: "물",
    meaning: "흐름을 살피고 유연하게 생각하는 모습",
    action: "결정하기 전에 생각을 적고 다른 관점도 들어 보세요.",
  },
} as const;
export function readingGuide(report: Report) {
  const element = elements[report.chart.element as keyof typeof elements];
  if (!element) throw Error("UNKNOWN_REPORT_ELEMENT");
  return {
    artwork: `/report-art/${element.key}.png`,
    artworkAlt: `${element.name}을 모티프로 한 오행 상징 그림`,
    lead: `이 운명서에서 나를 읽는 출발점은 ‘${element.name}’입니다. 전통적으로 ${element.meaning}에 빗댑니다. 정해진 성격이 아니라 나의 경험과 비교해 볼 관점이에요.`,
    action: element.action,
    points: [
      {
        title: "돈은 이렇게",
        text: "재물 이야기는 수입 예측보다 돈을 쓰는 기준을 돌아보며 읽어 보세요. 이번 달 고정지출과 자유롭게 쓸 돈을 나눠 적어 보세요.",
      },
      {
        title: "관계는 이렇게",
        text: "상대의 마음을 짐작하기보다 원하는 것과 불편한 점을 직접 나눠 보세요. 합이나 충이 관계의 결말을 정하지는 않아요.",
      },
      {
        title: "일은 이렇게",
        text: "직업 이름보다 내가 편하게 잘하는 활동에 주목해 보세요. 앞으로 한 달 동안 해볼 작은 경험 하나를 정해 보세요.",
      },
      {
        title: "시간의 흐름은 이렇게",
        text: report.chart.cycles.length
          ? "대운은 긴 기간을, 월별 흐름은 짧은 기간을 돌아보는 전통적인 틀이에요. 사건이 생기는 날짜나 성공을 약속하는 일정표는 아니에요."
          : "이 운명서는 대운 계산에 필요한 정보가 부족해 그 구간을 제시하지 않았어요. 월별 제안은 미래 예측보다 생활을 점검하는 참고로 읽어 보세요.",
      },
    ],
    glossary: [
      [
        "일간",
        "태어난 날의 천간이에요. 사주에서 나를 설명하는 기준점으로 사용해요.",
      ],
      [
        "오행",
        "나무·불·흙·금속·물이라는 다섯 상징이에요. 개수가 많거나 적다고 좋고 나쁨을 정하지 않아요.",
      ],
      [
        "십성",
        "나를 기준으로 다른 기운과의 관계에 붙인 전통적인 이름이에요. 재산이나 능력 점수가 아니에요.",
      ],
      [
        "대운",
        "긴 시간의 흐름을 살피는 계산 구간이에요. 이름의 ‘운’이 좋은 일만 뜻하는 것은 아니에요.",
      ],
    ],
  };
}
