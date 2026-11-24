import { expect, it } from "vitest";
import { reportTop3, easyLuckText } from "../lib/report-extras";
import { reportBook } from "../lib/report-book";
import { reportSelfGuide } from "../lib/report-self-guide";
it("adds four distinct three-item guides for each saved day element", () => {
  const all = ["목", "화", "토", "금", "수"].map((element) => {
    const guide = reportSelfGuide(element);
    expect(guide.map((s) => s.title)).toEqual([
      "그대의 장점 3가지",
      "그대의 단점 3가지",
      "가까이할 것 3가지",
      "멀리할 것 3가지",
    ]);
    for (const section of guide) {
      expect(section.items).toHaveLength(3);
      expect(new Set(section.items.map((item) => item.title)).size).toBe(3);
      expect(section.items.every((item) => item.text.length > 20)).toBe(true);
      expect(section.note).toContain("성격을 단정하는 검사는 아니니");
      expect(section.lead.length).toBeGreaterThan(60);
      expect(section.items.every((item) => item.text.length > 200)).toBe(true);
    }
    expect(reportTop3(element)!.sections.slice(2)).toEqual(guide);
    return JSON.stringify(guide);
  });
  expect(new Set(all).size).toBe(5);
  for (const value of [null, undefined, "__proto__", "木", {}])
    expect(reportSelfGuide(value)).toEqual([]);
  const changed = reportSelfGuide("목");
  changed[0].items[0].title = "modified";
  expect(reportSelfGuide("목")[0].items[0].title).not.toBe("modified");
});
it("offers three explained jobs and relationship types for every supported element", () => {
  for (const element of ["목", "화", "토", "금", "수"]) {
    const result = reportTop3(element)!;
    for (const section of result.sections)
      expect(
        section.lead.length +
          section.items.reduce((n, item) => n + item.text.length, 0),
      ).toBeGreaterThan(800);
    for (const list of [result.jobs, result.people]) {
      expect(list).toHaveLength(3);
      expect(new Set(list.map((x) => x.title)).size).toBe(3);
      expect(list.every((x) => x.text.length > 15)).toBe(true);
    }
    expect(result.note).toContain("상대 사주");
  }
  for (const value of [null, "__proto__", "木", {}])
    expect(reportTop3(value)).toBeNull();
});
it("uses the saved range covering the report year and preserves negative advice", () => {
  const text = easyLuckText(
    "역행을 이유로 이직을 서두르지 말거라.",
    [{ age: 32, startYear: 2026, endYear: 2035 }],
    2027,
  );
  expect(text).toContain("2026~2035");
  expect(text).toContain("32세");
  expect(text).toContain("서두르지 말거라");
  expect(text).not.toContain("역행");
});
it("does not invent an age or dates when cycles are excluded", () => {
  const text = easyLuckText("대운 계산 제외", [], 2027);
  expect(text).toContain("나이별 구간을 계산하지 않았");
  expect(text).not.toContain("2027년은");
});
it("only adapts the luck chapter without changing stored chapters", () => {
  const report = {
    chapters: Array.from({ length: 9 }, () => ({
      text: "순행의 흐름을 살피거라.",
    })),
    chart: { notes: [], cycles: [] },
  };
  const old = JSON.stringify(report);
  const book = reportBook(report);
  expect(book.chapters[6].text).toContain("약 10년");
  expect(book.chapters[0].text).toBe(report.chapters[0].text);
  expect(JSON.stringify(report)).toBe(old);
});
