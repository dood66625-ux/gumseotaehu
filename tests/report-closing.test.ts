import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportClosing from "../components/ReportClosing";
import { reportClosing } from "../lib/report-closing";

const saved = (element: unknown) => ({
  year: 2027,
  chapters: Array.from({ length: 9 }, (_, i) => ({
    text:
      i === 7
        ? "올해는 큰 약속을 서두르지 말거라.\nuncertainty: 독립 검수는 완료되지 않았습니다."
        : "오늘 할 수 있는 일 하나를 골라 보거라.",
  })),
  chart: { element, notes: [], cycles: [] },
});
it("summarizes the saved year and connects practical advice to a full-page letter without mutation", () => {
  const letters: string[] = [];
  for (const element of ["목", "화", "토", "금", "수"]) {
    const report = saved(element);
    const before = JSON.stringify(report);
    const ending = reportClosing(report, "하늘")!;
    expect(ending.yearLabel).toContain("2027");
    expect(ending.yearLead).toBe("올해는 큰 약속을 서두르지 말거라.");
    expect(ending.points.map((p) => p.title)).toEqual([
      "올해 힘쓸 일",
      "서두르지 않을 일",
      "지킬 습관",
    ]);
    expect(ending.salutation).toContain("하늘");
    expect(ending.paragraphs.join("")).toContain(
      ending.points[0].text.split(". ")[0],
    );
    expect(ending.paragraphs.join("").length).toBeGreaterThan(1100);
    expect(ending.paragraphs.join("").length).toBeLessThan(1400);
    expect(ending.points.every((point) => point.text.length > 200)).toBe(true);
    expect(JSON.stringify(ending)).not.toContain("uncertainty");
    expect(JSON.stringify(report)).toBe(before);
    letters.push(ending.paragraphs.join(""));
  }
  expect(new Set(letters).size).toBe(5);
});
it("keeps unnamed legacy reports readable and never invents a year or an element", () => {
  const report = { chapters: [], chart: { element: "목" } };
  const ending = reportClosing(report, "guest")!;
  expect(ending.salutation).not.toContain("guest");
  expect(ending.yearLabel).toBe("마음에 담을 약속");
  expect(ending.yearLead).toContain("세 가지만");
  expect(reportClosing(saved("__proto__"))).toBeNull();
});
it("renders both ending sections and safely escapes a customer name", () => {
  const html = renderToStaticMarkup(
    createElement(ReportClosing, {
      report: saved("수"),
      name: "<script>alert(1)</script>",
    }),
  );
  expect(html).toContain("올해 꼭 기억할 세 가지");
  expect(html).toContain("태후가 그대에게 남기는 마지막 편지");
  expect(html).not.toContain('aria-haspopup="dialog"');
  expect(html).toContain("reading-inline-full");
  expect(html.match(/<h3>/g)!.length).toBeGreaterThanOrEqual(3);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
