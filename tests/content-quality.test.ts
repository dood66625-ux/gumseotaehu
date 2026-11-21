import { describe, expect, it } from "vitest";
import { calculate, type Birth } from "../lib/astrology";
import { generate, preview, validateReport } from "../lib/interpretation";
const birth: Birth = {
  name: "가상검수",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "female",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
describe("content evidence and uncertainty gates (offline, not expert approval)", () => {
  it("varies monthly advice and chapter evidence across ten day stems", () => {
    const chapters = new Set<string>();
    const months = new Set<string>();
    const stems = new Set<string>();
    for (let day = 10; day < 20; day++) {
      const c = calculate({ ...birth, date: `1995-05-${day}` });
      const r = generate(c);
      stems.add(c.day);
      chapters.add(r.chapters[4].text);
      months.add(r.chapters[7].text);
      expect(r.chapters[6].claimIds).toContain("CYCLES");
      expect(r.chapters[3].claimIds).toContain("RELATIONS");
      expect(r.chapters[4].claimIds).toContain("TEN_GODS");
      expect(r.chapters[7].claimIds).toContain("MONTHS");
      expect(r.chapters.every((s) => s.text.length >= 100)).toBe(true);
      expect(r.chapters[7].text).toContain("12월");
      expect(generate(c)).toEqual(r);
    }
    expect(stems.size).toBe(10);
    expect(chapters.size).toBe(10);
    expect(months.size).toBe(10);
  });
  it("does not invent luck periods when time or calculation category is absent", () => {
    for (const input of [
      { ...birth, time: null },
      { ...birth, sex: "unspecified" },
    ]) {
      const c = calculate(input),
        r = generate(c);
      expect(c.cycles).toEqual([]);
      expect(r.chapters[6].text).toContain("산출하지 않습니다");
      expect(r.notes).toEqual(c.notes);
      expect(r.chapters[6].text).not.toMatch(/\d{4}~\d{4}년/);
    }
  });
  it("names all tied elements rather than picking a fortunate dominant element", () => {
    const c = calculate(birth);
    c.counts = { 목: 2, 화: 2, 토: 2, 금: 1, 수: 1 };
    expect(preview(c).cards[1].text).toContain("목·화·토");
  });
  it("blocks removal of uncertainty, duplicated chapters, incorrect year and unsafe introduction", () => {
    const c = calculate(birth),
      r = generate(c);
    expect(() => validateReport({ ...r, notes: [] }, c)).toThrow(
      "UNCERTAINTY_REMOVED",
    );
    const duplicate = structuredClone(r);
    duplicate.chapters[1].text = duplicate.chapters[0].text;
    expect(() => validateReport(duplicate, c)).toThrow("DUPLICATE_CHAPTER");
    expect(() => validateReport({ ...r, year: c.target + 1 }, c)).toThrow(
      "YEAR_MISMATCH",
    );
    expect(() =>
      validateReport({ ...r, intro: r.intro + " 반드시 성공하리라." }, c),
    ).toThrow("UNSAFE_CONTENT");
  });
  it("rejects explicit day-stem and element-count contradictions", () => {
    const c = calculate(birth),
      r = generate(c);
    const changed = structuredClone(r);
    changed.chapters[0].text += ` 일간은 ${c.day === "甲" ? "乙" : "甲"}입니다.`;
    expect(() => validateReport(changed, c)).toThrow("DAY_FACT_MISMATCH");
    const wrong = structuredClone(r);
    wrong.chapters[0].text += ` 목 ${c.counts.목 + 1}, 화 ${c.counts.화}입니다.`;
    expect(() => validateReport(wrong, c)).toThrow("COUNT_FACT_MISMATCH");
  });
  it("preserves chart and handles legacy stored charts without new claim groups", () => {
    const c = calculate(birth);
    c.claims = c.claims.slice(0, 3);
    const before = structuredClone(c);
    const r = generate(c);
    expect(c).toEqual(before);
    expect(r.chart).toEqual(c);
    expect(r.chapters[6].text).toContain(
      "이 저장본에는 해당 계산 근거가 없습니다",
    );
  });
});

it.each(["whitespace", "invisible", "decomposed"])(
  "rejects a chapter duplicated through %s without changing the supplied report",
  (variant) => {
    const c = calculate(birth),
      r = generate(c);
    const original = r.chapters[0].text;
    r.chapters[1].text =
      variant === "whitespace"
        ? "  " + original.replace(/ /g, "  ").replace(/\n/g, "\t\n") + "  "
        : variant === "invisible"
          ? original.replace(/ /g, "\u200b ")
          : original.normalize("NFD");
    const before = JSON.stringify(r);
    expect(() => validateReport(r, c)).toThrow("DUPLICATE_CHAPTER");
    expect(JSON.stringify(r)).toBe(before);
  },
);
it("applies the same investment guarantee rejection to chapter copy and introduction", () => {
  const c = calculate(birth),
    r = generate(c);
  const chapter = structuredClone(r);
  chapter.chapters[2].text += " 수익 보장 상품이니라.";
  expect(() => validateReport(chapter, c)).toThrow("UNSAFE_CONTENT");
  expect(() =>
    validateReport({ ...r, intro: r.intro + " 수익 보장 상품이니라." }, c),
  ).toThrow("UNSAFE_CONTENT");
});

it.each([
  "수익   보장",
  "수익\n보장",
  "수\u200b익 보장",
  "수익 보장".normalize("NFD"),
])("rejects formatting variations of a guarantee in chapter copy", (phrase) => {
  const c = calculate(birth),
    r = generate(c);
  r.chapters[2].text += " " + phrase + " 상품이니라.";
  expect(() => validateReport(r, c)).toThrow("UNSAFE_CONTENT");
});
