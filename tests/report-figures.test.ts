import { expect, it } from "vitest";
import { reportFigures } from "../lib/report-figures";
it("provides three distinct people in both languages for each day element", () => {
  for (const element of ["목", "화", "토", "금", "수"])
    for (const locale of ["ko", "zh-TW"] as const) {
      const result = reportFigures(element, locale)!;
      expect(result.people).toHaveLength(3);
      expect(new Set(result.people.map((p) => p.name)).size).toBe(3);
      for (const person of result.people) {
        expect(person.work.length).toBeGreaterThan(10);
        expect(person.lesson.length).toBeGreaterThan(10);
      }
      expect(result.note).toMatch(
        locale === "ko" ? /실제 사주 일치도가 아니라/ : /並非本人命盤/,
      );
    }
});
it("does not invent a comparison when the element is absent or invalid", () => {
  for (const value of [undefined, null, "", "__proto__", "木", {}, 1])
    expect(reportFigures(value)).toBeNull();
});
it("is deterministic for older saved charts and localizes editorial text without a generation call", () => {
  expect(reportFigures("목")).toEqual(reportFigures("목"));
  expect(reportFigures("목")?.people[0].name).toBe("세종대왕");
  expect(reportFigures("목", "zh-TW")?.people[0].name).toBe("世宗大王");
  expect(reportFigures("목")?.people).not.toEqual(reportFigures("수")?.people);
});
