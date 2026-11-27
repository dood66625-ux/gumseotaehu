import { reportBook } from "./report-book";
import { reportType } from "./report-type";
import { readingGuide } from "./report-reading-guide";
import { reportTop3 } from "./report-extras";
import { reportClosing } from "./report-closing";
import { reportFigures } from "./report-figures";
import { reportPortrait } from "./report-portrait";
import { taehouNarration } from "./taehou-narration";
import type { Report } from "./interpretation";
export type ReportScene = {
  key: string;
  title: string;
  eyebrow: string;
  text: string;
};
/** Presentation only. Existing saved report and supplements are reused without generation. */
export function reportScenes(report: Report, name: string): ReportScene[] {
  const book = reportBook(report),
    type = reportType(report.chart),
    guide = readingGuide(report);
  const result: ReportScene[] = [
    {
      key: "welcome",
      title: `${name}, 그대의 금서를 펼치노라`,
      eyebrow: "금서태후의 첫마디",
      text: taehouNarration(report.intro),
    },
    {
      key: "type",
      title: `그대는 ${type.name}이니라`,
      eyebrow: "그대의 대표 타입",
      text: [
        type.title,
        type.lead,
        type.tags.map((t) => "#" + t).join(" "),
        type.action,
        type.note,
      ].join("\n\n"),
    },
  ];
  report.chapters.forEach((c, i) =>
    result.push({
      key: "chapter-" + i,
      title: c.title,
      eyebrow: `아홉 장 중 ${i + 1}장`,
      text: [
        book.chapters[i].text,
        book.chapters[i].practice &&
          "그대의 일상에 가져가 보거라\n" + book.chapters[i].practice,
        book.chapters[i].takeaway &&
          "이 장의 한마디\n" + book.chapters[i].takeaway,
      ]
        .filter(Boolean)
        .join("\n\n"),
    }),
  );
  result.push({
    key: "guide",
    title: "쉽게 읽는 내 운명서",
    eyebrow: "그대의 일상으로",
    text: [
      guide.lead,
      guide.action,
      ...guide.points.map((p) => p.title + "\n" + p.text),
    ].join("\n\n"),
  });
  const top = reportTop3(report.chart.element);
  for (const section of top?.sections ?? [])
    result.push({
      key: "extra-" + result.length,
      title: section.title,
      eyebrow: "그대에게 더하는 이야기",
      text: [
        section.lead,
        ...section.items.map((p, i) => `${i + 1}. ${p.title}\n${p.text}`),
        section.note,
      ].join("\n\n"),
    });
  const portrait = reportPortrait(report.chart.element);
  if (portrait)
    result.push({
      key: "portrait",
      title: portrait.title,
      eyebrow: "금서태후의 궁정 도감",
      text: [
        portrait.role,
        portrait.story,
        portrait.traits.join(" · "),
        "오늘 곁에 둘 색\n" + portrait.colors.map((c) => c[0]).join(" · "),
        portrait.item,
        portrait.note,
      ].join("\n\n"),
    });
  const figures = reportFigures(report.chart.element);
  if (figures)
    result.push({
      key: "figures",
      title: figures.title,
      eyebrow: "세 인물에게 배우다",
      text: [
        figures.lead,
        ...figures.people.map((p) => `${p.name}\n${p.work}\n${p.lesson}`),
        figures.note,
      ].join("\n\n"),
    });
  const ending = reportClosing(report, name);
  if (ending) {
    result.push({
      key: "year",
      title: ending.summaryTitle,
      eyebrow: ending.yearLabel,
      text: [
        ending.yearLead,
        ...ending.points.map((p) => p.title + "\n" + p.text),
      ].join("\n\n"),
    });
    result.push({
      key: "letter",
      title: ending.letterTitle,
      eyebrow: "금서를 덮기 전에",
      text: [ending.salutation, ...ending.paragraphs, ending.signature].join(
        "\n\n",
      ),
    });
  }
  return result;
}
