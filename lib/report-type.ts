/** A fictional, shareable character type derived from existing chart labels. No new calculation or AI call. */
const types = [
  {
    god: "편관",
    name: "권력형",
    title: "판을 이끄는 결단가",
    lead: "어려운 순간에도 앞에 서서 방향을 정하는 힘이 있느니라.",
    tags: ["결단", "추진", "책임"],
    action: "빠른 결단에 곁사람의 이야기를 한 번 더 보태 보거라.",
  },
  {
    god: "정인",
    name: "과학자형",
    title: "깊이 파고드는 탐구자",
    lead: "왜 그런지 끝까지 살피고, 배운 것을 그대의 것으로 만드는 사람이구나.",
    tags: ["탐구", "배움", "집중"],
    action: "궁금한 것을 작게 시험하고, 알게 된 사실을 기록해 보거라.",
  },
  {
    god: "편재",
    name: "사업가형",
    title: "기회를 연결하는 개척자",
    lead: "사람과 가능성을 이어 새로운 길을 찾아내는 힘이 있느니라.",
    tags: ["기회", "연결", "실행"],
    action: "좋아 보이는 기회일수록 시간과 비용을 먼저 정해 보거라.",
  },
  {
    god: "편인",
    name: "분석가형",
    title: "이면을 읽는 관찰자",
    lead: "겉으로 드러난 답보다 그 뒤의 까닭을 먼저 살피는 사람이구나.",
    tags: ["관찰", "통찰", "분석"],
    action: "깊이 살핀 뒤에는 작은 선택 하나를 실제로 해 보거라.",
  },
  {
    god: "식신",
    name: "발명가형",
    title: "생각을 현실로 빚는 사람",
    lead: "머릿속 생각을 손에 잡히는 무언가로 바꾸는 재주가 있느니라.",
    tags: ["호기심", "제작", "꾸준함"],
    action: "완벽한 완성보다 오늘 만들어 볼 작은 모양부터 정하거라.",
  },
  {
    god: "상관",
    name: "창작가형",
    title: "자기만의 답을 그리는 사람",
    lead: "익숙한 틀을 다른 눈으로 보고 그대만의 표현을 찾는 사람이구나.",
    tags: ["표현", "상상", "새로움"],
    action: "남과 다른 생각을 알아듣기 쉬운 한 문장으로 꺼내 보거라.",
  },
  {
    god: "정재",
    name: "전략가형",
    title: "차근차근 성과를 쌓는 사람",
    lead: "큰 약속보다 지킬 수 있는 계획으로 믿음을 만드는 사람이구나.",
    tags: ["계획", "꾸준함", "실속"],
    action: "계획 안에 쉴 자리와 뜻밖의 변화를 위한 여백도 남겨 두거라.",
  },
  {
    god: "정관",
    name: "지도자형",
    title: "신뢰로 사람을 모으는 사람",
    lead: "약속과 기준을 지키며 함께 갈 방향을 세우는 힘이 있느니라.",
    tags: ["신뢰", "기준", "책임"],
    action: "좋은 기준은 그대 자신에게도 따뜻해야 한다는 것을 기억하거라.",
  },
  {
    god: "비견",
    name: "개척자형",
    title: "자신의 길을 여는 사람",
    lead: "스스로 고른 길을 묵묵히 걸으며 중심을 지키는 사람이구나.",
    tags: ["독립", "주도", "소신"],
    action: "그대의 길을 지키되 필요한 도움에는 마음을 열어 보거라.",
  },
  {
    god: "겁재",
    name: "도전가형",
    title: "함께 부딪치며 성장하는 사람",
    lead: "주저앉기보다 한 번 더 부딪치고 사람들 사이에서 힘을 얻는 사람이구나.",
    tags: ["도전", "활력", "동료"],
    action: "이기고 싶은 마음 옆에 함께 지킬 약속도 놓아 보거라.",
  },
] as const;
const fallback: Record<string, string> = {
  목: "비견",
  화: "상관",
  토: "정재",
  금: "정관",
  수: "편인",
};
export function reportType(chart: {
  tenGods?: unknown;
  element?: unknown;
  day?: unknown;
}) {
  const gods = Array.isArray(chart.tenGods) ? chart.tenGods : [];
  const score = new Map<string, number>();
  // Month is the strongest available context; the hour is used only when supplied by the chart.
  for (const [i, weight] of [
    [0, 1],
    [1, 3],
    [3, 2],
  ] as const)
    if (typeof gods[i] === "string")
      score.set(gods[i], (score.get(gods[i]) ?? 0) + weight);
  const preference = fallback[String(chart.element)] ?? "비견";
  const ranked = types
    .map((type, index) => ({
      type,
      score: (score.get(type.god) ?? 0) + (type.god === preference ? 0.1 : 0),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked[0].type;
  return {
    ...selected,
    note: "사주의 특징을 이야기로 풀어낸 금서태후의 캐릭터 타입이니라.",
    shareText: `나는 금서태후에서 ${selected.name}이래! ${selected.title}. 너는 무슨 타입일까?`,
    shareUrl: "https://gumseo.kr/?from=type-share",
  };
}
