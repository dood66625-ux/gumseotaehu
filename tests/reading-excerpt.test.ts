import { expect, it } from "vitest";
import { readingExcerpt } from "../lib/reading-excerpt";
it("keeps complete advice including its conditions and negation", () => {
  const first = "준비가 끝나지 않았다면 큰 약속을 서두르지 말거라.";
  expect(readingExcerpt(first + " 확인할 내용을 적어 보거라.", 10)).toBe(first);
  expect(readingExcerpt("첫 문장이니라.\n다음 문장이니라.", 10)).toBe(
    "첫 문장이니라.",
  );
  expect(readingExcerpt("")).toBe("");
});
