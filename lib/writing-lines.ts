const stems: Record<
  string,
  { name: string; image: string; quality: string; element: string }
> = {
  甲: { name: "갑목", image: "큰 나무", quality: "굳센", element: "목" },
  乙: {
    name: "을목",
    image: "유연한 풀과 덩굴",
    quality: "유연한",
    element: "목",
  },
  丙: {
    name: "병화",
    image: "밝은 햇살",
    quality: "밝고 당당한",
    element: "화",
  },
  丁: { name: "정화", image: "작은 등불", quality: "온기 어린", element: "화" },
  戊: { name: "무토", image: "큰 산", quality: "묵직한", element: "토" },
  己: { name: "기토", image: "기름진 밭", quality: "포근한", element: "토" },
  庚: { name: "경금", image: "단단한 쇠", quality: "단단한", element: "금" },
  辛: { name: "신금", image: "정갈한 보석", quality: "섬세한", element: "금" },
  壬: {
    name: "임수",
    image: "흐르는 큰 물",
    quality: "깊고 너른",
    element: "수",
  },
  癸: {
    name: "계수",
    image: "맑은 이슬",
    quality: "맑고 섬세한",
    element: "수",
  },
};
const elementLines: Record<string, string> = {
  목: "목의 글자가 눈에 띄는구나. 가지를 뻗는 나무가 떠오르는도다.",
  화: "화의 글자가 눈에 띄는구나. 어둠을 밝히는 불빛이 떠오르는도다.",
  토: "토의 글자가 눈에 띄는구나. 기운을 품는 대지가 떠오르는도다.",
  금: "금의 글자가 눈에 띄는구나. 정성껏 벼린 쇠가 떠오르는도다.",
  수: "수의 글자가 눈에 띄는구나. 깊이 흐르는 물길이 떠오르는도다.",
};
export const defaultWritingLines = [
  "천간과 지지에 새겨진 그대의 기운을 살피고 있느니라.",
  "목·화·토·금·수, 다섯 기운이 어우러진 이야기를 읽고 있노라.",
  "사주에 담긴 이야기를 모아, 그대만의 금서를 펼쳐 주마.",
];
/** Only calculated stem/count metaphors: no prediction, AI call or raw birth data. */
export function writingLinesForChart(chart: unknown): string[] {
  if (!chart || typeof chart !== "object") return [...defaultWritingLines];
  const value = chart as { day?: unknown; counts?: unknown };
  const stem =
    typeof value.day === "string" && Object.hasOwn(stems, value.day)
      ? stems[value.day]
      : undefined;
  if (!stem) return [...defaultWritingLines];
  let middle = defaultWritingLines[1];
  if (value.counts && typeof value.counts === "object") {
    const counts = value.counts as Record<string, unknown>;
    const entries = Object.keys(elementLines).map(
      (key) => [key, counts[key]] as const,
    );
    if (
      entries.every(
        ([, n]) =>
          typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8,
      )
    ) {
      const highest = Math.max(...entries.map(([, n]) => n as number));
      const leaders = entries.filter(([, n]) => n === highest);
      middle =
        leaders.length === 1
          ? elementLines[leaders[0][0]]
          : "여러 기운이 나란히 드러나는구나. 그 어우러짐을 살펴보마.";
    }
  }
  return [
    `${stem.name}${(stem.name.charCodeAt(stem.name.length - 1) - 0xac00) % 28 === 0 ? "는" : "은"} 곧 ${stem.image}의 기운이니…`,
    middle,
    `참으로 ${stem.quality} 기운을 품은 운명이로구나. 금서에 담아 주마.`,
  ];
}
export function previewWritingChart(day?: string) {
  const aliases: Record<string, string> = {
    갑: "甲",
    을: "乙",
    병: "丙",
    정: "丁",
    무: "戊",
    기: "己",
    경: "庚",
    신: "辛",
    임: "壬",
    계: "癸",
  };
  const key =
    day && Object.hasOwn(stems, day)
      ? day
      : (day && Object.hasOwn(aliases, day) && aliases[day]) || "甲";
  const counts: Record<string, number> = { 목: 1, 화: 1, 토: 1, 금: 1, 수: 1 };
  counts[stems[key].element] = 4;
  return { day: key, counts };
}
