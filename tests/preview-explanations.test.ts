import { expect, it } from "vitest";
import { previewExplanations } from "../lib/preview-explanations";
it("includes tied elements without choosing an arbitrary winner", () => {
  const result = previewExplanations({
    day: "甲",
    element: "목",
    trait: "배우고 자라는",
    counts: { 목: 2, 화: 2, 토: 1, 금: 1, 수: 0 },
    pillars: ["甲子", "乙丑", "甲午", null],
  });
  expect(result.elements).toContain("목·화");
  expect(result.pillars).toContain("甲(목)");
  expect(result.pillars).toContain("시각은 몰라서 비워");
  expect(result.elements).toContain("등급으로 읽지는 말거라");
});
