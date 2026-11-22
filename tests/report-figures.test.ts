import { expect, it } from "vitest";
import { reportFigures } from "../lib/report-figures";
it("provides three distinct Korean historical figures for each day element", () => {
  for (const element of ["목", "화", "토", "금", "수"])
    for (const locale of ["ko", "zh-TW"] as const) {
      const result = reportFigures(element, locale)!;
      expect(result.people).toHaveLength(3);
      expect(new Set(result.people.map((p) => p.name)).size).toBe(3);
      for (const person of result.people) {
        expect(person.work.length).toBeGreaterThan(10);
        expect(person.lesson.length).toBeGreaterThan(10);
      }
      expect(result.note).toMatch(/실제 사주 일치도가 아니라/);
    }
});
it("does not invent a comparison when the element is absent or invalid", () => {
  for (const value of [undefined, null, "", "__proto__", "木", {}, 1])
    expect(reportFigures(value)).toBeNull();
});
it("is deterministic for older saved charts and keeps Korean editorial text without a generation call", () => {
  expect(reportFigures("목")).toEqual(reportFigures("목"));
  expect(reportFigures("목")?.people[0].name).toBe("세종대왕");
  expect(reportFigures("목", "zh-TW")?.people[0].name).toBe("세종대왕");
  expect(reportFigures("목")?.people).not.toEqual(reportFigures("수")?.people);
});

it("only selects from the Korean historical roster, including legacy locale requests", () => {
  const names = new Set([
    "세종대왕",
    "이이",
    "이황",
    "허난설헌",
    "김홍도",
    "신사임당",
    "정약용",
    "김만덕",
    "이원익",
    "장영실",
    "이순신",
    "정조",
    "김정호",
    "윤동주",
    "허준",
  ]);
  for (const element of ["목", "화", "토", "금", "수"]) {
    const result = reportFigures(element)!;
    for (const person of result.people)
      expect(names.has(person.name)).toBe(true);
    expect(reportFigures(element, "zh-TW")).toEqual(result);
  }
});
