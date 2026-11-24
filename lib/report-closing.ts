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
      "아홉 장의 이야기를 여기까지 따라왔구나. 금서를 펼칠 때 품었던 물음에 조금은 다른 빛이 들었느냐? 모든 대목이 지금의 그대와 꼭 같을 필요는 없느니라. 고개가 끄덕여진 말은 마음에 담고, 낯선 말은 살아온 경험과 견주어 보거라. 남의 문장이 그대의 삶보다 앞설 수는 없느니라.",
      `내가 그대에게 먼저 남기고 싶은 말은 ‘${strengths.items[0].title}’이니라. ${strengths.items[0].shortText} 그 힘이 이미 드러난 순간이 있는지 떠올려 보거라. 남이 크게 칭찬한 일이 아니어도 좋으니라. 어렵던 일을 다시 해 보았던 날, 누군가를 위해 마음을 썼던 날처럼 그대만 아는 장면도 그대의 기록이니라.`,
      `다만 힘을 잘 쓰려면 그 힘 때문에 지치는 순간도 알아야 하느니라. ${weaknesses.items[0].shortText} 이런 모습을 발견했다고 스스로를 모자란 사람으로 부르지는 말거라. 무엇이 그대를 급하게 했는지, 어디에서 부담이 커졌는지 살피면 다음에는 다른 방법을 고를 수 있느니라. 바꿀 것은 그대 전체가 아니라 오늘의 행동 하나이니라.`,
      "일과 돈 앞에서는 하고 싶은 일과 감당할 몫을 함께 적어 보거라. 누군가의 빠른 성과가 그대의 마감이 되는 것은 아니니라. 정보가 모자라다면 확인하고, 되돌리기 어려운 약속이라면 내용을 다시 살펴도 좋으니라.",
      "인연 앞에서는 상대를 읽는 일만큼 그대의 마음을 전하는 일도 소중하니라. 알아주기를 기다렸던 바람이 있다면 짧고 분명하게 말해 보거라. 함께할수록 편안한지, 서로의 경계를 존중하는지도 살피거라. 그대가 참기만 해야 이어지는 관계라면 무엇이 힘든지 돌아볼 자리를 먼저 마련하거라. 좋은 관계는 한 사람의 노력만으로 완성되지 않느니라.",
      `이제 금서를 덮은 뒤의 첫걸음을 정해 보거라. ${approach.items[0].shortText} 오늘 할 수 있는 작은 크기로 줄이고 언제 해 볼지 적으면 충분하니라. 한 주 뒤에는 얼마나 대단해졌는지 묻기보다 어떤 순간이 편해졌는지 살펴보거라. 맞지 않으면 방법을 바꾸면 되느니라. 계획을 고치는 것은 길을 잃는 일과 다르지.`,
      "그대의 다음 이야기는 아직 쓰이지 않았느니라. 어느 길로 걸을지, 무엇을 지키고 무엇을 내려놓을지는 그대의 손에 있지. 완벽한 날을 기다리기보다 오늘 가능한 한 걸음을 골라 보거라. 빠르게 걷는 날에도, 잠시 멈추는 날에도 그대가 스스로의 편이기를 바라노라. 나는 그대가 직접 써 내려갈 다음 장을 기다리겠노라.",
    ],
    signature: "그대의 다음 장을 기다리며, 금서태후",
  };
}
