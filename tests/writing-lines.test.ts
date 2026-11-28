import { expect, it } from "vitest";
import {
  writingLinesForChart,
  previewWritingChart,
  defaultWritingLines,
} from "../lib/writing-lines";
it.each(["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"])(
  "uses calculated day stem %s for distinct narration",
  (day) => {
    const lines = writingLinesForChart(previewWritingChart(day));
    expect(lines).toHaveLength(3);
    expect(
      lines.every((line) => line.length < 70 && !/undefined|NaN/.test(line)),
    ).toBe(true);
    expect(lines).not.toEqual(defaultWritingLines);
  },
);
it("changes the metaphor and tone between tree and lamplight", () => {
  const tree = writingLinesForChart(previewWritingChart("갑"));
  const lamp = writingLinesForChart(previewWritingChart("정"));
  expect(tree[0]).toContain("갑목은 곧 큰 나무");
  expect(tree[2]).toContain("굳센");
  expect(lamp[0]).toContain("정화는 곧 작은 등불");
  expect(lamp[2]).toContain("온기 어린");
});
it("ties do not pretend that one element dominates or infer fate from strength", () => {
  const lines = writingLinesForChart({
    day: "甲",
    counts: { 목: 2, 화: 2, 토: 2, 금: 1, 수: 1 },
  });
  expect(lines[1]).toContain("여러 기운이 나란히");
  expect(lines.join()).not.toMatch(/부족|결핍|불행|대박|신강|신약/);
});
it.each([undefined, {}, { day: "unknown" }, { day: "toString" }])(
  "missing or invalid charts receive honest fallback",
  (chart) => {
    expect(writingLinesForChart(chart)).toEqual(defaultWritingLines);
  },
);
it("invalid counts do not fabricate an element observation", () => {
  expect(writingLinesForChart({ day: "甲", counts: { 목: 99 } })[1]).toBe(
    defaultWritingLines[1],
  );
  expect(previewWritingChart("__proto__").day).toBe("甲");
});
