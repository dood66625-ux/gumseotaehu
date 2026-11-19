import { expect, it } from "vitest";
import { bookText, chapterTakeaway } from "../scripts/private-reader/book";
it("moves repeated global calculation disclosures out of chapter copy without changing the original", () => {
  const note =
    "한국 음력·절기 독립 대조 및 전문가 검수가 완료되지 않은 로컬 검증 결과입니다.";
  const raw = "오늘의 작은 선택을 살펴보거라.\nuncertainty: " + note;
  expect(bookText(raw, [note])).toEqual({
    text: "오늘의 작은 선택을 살펴보거라.",
    moved: [note],
  });
  expect(raw).toContain(note);
});
it("keeps chapter-specific unknown-birth-time limitations while moving explicit technical labels", () => {
  const warning = "시각 미상이므로 시주는 풀이하지 않느니라.";
  expect(bookText(warning, [warning]).text).toBe(warning);
  const result = bookText("풀이\nuncertainty: 별도 계산 기준", []);
  expect(result.text).toBe("풀이");
  expect(result.moved).toEqual(["별도 계산 기준"]);
});

it("chooses an intact practical Korean sentence without changing the saved meaning", () => {
  const text =
    "그대는 주변의 흐름을 세심하게 읽는 편이니라. 오늘 마음에 남는 일 하나를 기록해 보거라. 하지만 모든 결론을 서둘러 내릴 필요는 없느니라.";
  expect(chapterTakeaway(text, "ko")).toBe(
    "오늘 마음에 남는 일 하나를 기록해 보거라.",
  );
});
it("supports traditional Chinese and preserves conditionals rather than cutting a sentence short", () => {
  const sentence = "若今天感到疲倦，不妨先照顧自己的步調。";
  expect(chapterTakeaway("這是你的命書。" + sentence, "zh-TW")).toBe(sentence);
  expect(chapterTakeaway("", "ko")).toBe("");
  const long =
    "그대의 선택에 따라 달라질 수 있으니 " +
    "오늘의 마음을 천천히 살펴보거라 ".repeat(12) +
    ".";
  expect(chapterTakeaway(long, "ko")).toBe(long.replace(/\s+/g, " ").trim());
});
