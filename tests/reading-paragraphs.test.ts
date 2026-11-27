import { expect, it } from "vitest";
import { readingParagraphs } from "../lib/reading-paragraphs";
it("splits long prose without rewriting content and highlights at most two original sentences", () => {
  const text = Array.from(
    { length: 12 },
    (_, i) =>
      `${i + 1}번째 이야기는 그대가 천천히 읽고 일상에 가져갈 말을 담고 있느니라.`,
  ).join(" ");
  const result = readingParagraphs(text);
  expect(result.length).toBeGreaterThan(2);
  expect(result.map((p) => p.text).join(" ")).toBe(text);
  expect(result.filter((p) => p.emphasis).length).toBeLessThanOrEqual(2);
  expect(result.every((p) => p.text.startsWith(p.emphasis))).toBe(true);
});
it("keeps explicit line breaks and literal user text as text", () => {
  expect(
    readingParagraphs("첫 문단이니라.\n\n<script>alert(1)</script>").map(
      (p) => p.text,
    ),
  ).toEqual(["첫 문단이니라.", "<script>alert(1)</script>"]);
});
