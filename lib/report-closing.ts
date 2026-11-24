import { reportBook } from "./report-book";
import { reportSelfGuide } from "./report-self-guide";

/** Compose the ending from saved text and existing guidance, without generating new predictions. */
export function reportClosing(
  report: Parameters<typeof reportBook>[0] & {
    year?: number;
    chart: Parameters<typeof reportBook>[0]["chart"] & { element?: unknown };
  },
  name?: unknown,
) {
  const guide = reportSelfGuide(report.chart.element);
  if (!guide.length) return null;
  const [strengths, weaknesses, approach] = guide;
  const year = Number.isInteger(report.year)
    ? report.year
    : report.chart.target;
  const annual = reportBook(report).chapters[7]?.takeaway;
  const yearLead =
    annual && annual.length <= 120
      ? annual
      : "앞서 읽은 흐름을 떠올리며, 올해 실천할 것 세 가지만 마음에 담아 보거라.";
  const cleanName = typeof name === "string" ? name.trim().slice(0, 40) : "";
  const salutation =
    cleanName && cleanName !== "guest"
      ? `${cleanName}, 그대에게.`
      : "이 금서를 끝까지 펼친 그대에게.";
  return {
    summaryTitle: "올해 꼭 기억할 세 가지",
    yearLabel: Number.isInteger(year)
      ? `${year}년, 마음에 담을 약속`
      : "마음에 담을 약속",
    yearLead,
    points: [
      { title: "올해 힘쓸 일", text: approach.items[0].text },
      { title: "서두르지 않을 일", text: weaknesses.items[0].text },
      { title: "지킬 습관", text: approach.items[1].text },
    ],
    letterTitle: "태후가 그대에게 남기는 마지막 편지",
    salutation,
    paragraphs: [
      "아홉 장의 이야기를 여기까지 따라왔구나. 모든 말을 외우려 애쓰지 말거라. 마음에 닿은 한마디면 충분하니라.",
      `‘${strengths.items[0].title}’, 그대가 길러 갈 힘을 기억하거라. ${strengths.items[0].text}`,
      `잘되지 않은 하루로 그대의 모든 날을 판단하지 말거라. ${weaknesses.items[0].text}`,
      `이 금서를 덮은 뒤에는 작은 일 하나만 해 보거라. ${approach.items[0].text}`,
      "다음 이야기는 아직 쓰이지 않았느니라. 어느 길로 걸을지는 그대의 손으로 고르거라. 나는 그대의 한 걸음을 응원하겠노라.",
    ],
    signature: "그대의 다음 장을 기다리며, 금서태후",
  };
}
