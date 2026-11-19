import { expect, it } from "vitest";
import {
  bookText,
  chapterTakeaway,
  easyTakeaway,
} from "../scripts/private-reader/book";
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

it("prefers a short everyday sentence over technical astrology even when both contain advice", () => {
  const text =
    "그대의 비겁(比劫)과 재성(財星)의 상생을 유념하거라. 돈을 쓰기 전에 꼭 필요한지 한 번 더 생각해 보거라.";
  const summary = chapterTakeaway(text, "ko");
  expect(summary).toBe("돈을 쓰기 전에 꼭 필요한지 한 번 더 생각해 보거라.");
  expect(summary).not.toMatch(/[\u3400-\u9fff]|비겁|재성|상생/);
});
it("explains known terms without Chinese annotations or losing a negative qualification", () => {
  const summary = chapterTakeaway(
    "재성(財星)이 있다고 돈이 저절로 모이는 것은 아니니라.",
    "ko",
  );
  expect(summary).not.toMatch(/財|星|재성/);
  expect(summary).toContain("저절로 모이는 것은 아니니라");
  expect(easyTakeaway("중요한 결정을 숙고하거라.", "ko")).toBe(
    "중요한 결정을 천천히 생각해 보거라.",
  );
});

it("does not rewrite everyday words that merely contain the same syllables", () => {
  const text = "돈의 크기와 상관없이 그대의 선택을 믿어 보거라.";
  expect(easyTakeaway(text, "ko")).toBe(text);
  expect(easyTakeaway("주관성을 돌아보거라.", "ko")).toBe(
    "주관성을 돌아보거라.",
  );
});
