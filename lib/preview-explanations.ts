/** Plain readings anchored to the existing chart, without new predictions. */
export function previewExplanations(chart: {
  day: string;
  element: string;
  trait: string;
  counts: Record<string, number>;
  pillars: (string | null)[];
}) {
  const max = Math.max(...Object.values(chart.counts));
  const highest = Object.entries(chart.counts)
    .filter(([, count]) => count === max)
    .map(([element]) => element)
    .join("·");
  return {
    pillars: `네 칸은 태어난 해·달·날·시각의 기록이니라. 날의 기운인 ${chart.day}(${chart.element})를 중심으로, ${chart.trait} 모습을 살펴보는 것이니라.${chart.pillars[3] ? "" : " 태어난 시각은 몰라서 비워 두었느니라."}`,
    elements: `${highest}의 표시가 가장 많구나. 그대의 금서는 ${chart.element}의 결을 중심으로 ${chart.trait} 모습을 살피느니라. 개수의 크기를 좋고 나쁨의 등급으로 읽지는 말거라.`,
  };
}
