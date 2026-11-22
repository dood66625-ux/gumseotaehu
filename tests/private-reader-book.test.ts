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

it("shares cleaned chapter summaries and deduplicated endnotes without mutating stored content", async () => {
  const { reportBook } = await import("../lib/report-book");
  const note =
    "한국 음력·절기 독립 대조 및 전문가 검수가 완료되지 않은 로컬 검증 결과입니다.";
  const chapterWarning = "시각 미상이므로 시주는 풀이하지 않느니라.";
  const report = {
    chapters: [
      {
        text: "돈을 쓰기 전에 꼭 필요한지 생각해 보거라.\nuncertainty: " + note,
      },
      { text: chapterWarning },
    ],
    notes: [note],
    chart: { notes: [note, chapterWarning] },
  };
  const original = JSON.stringify(report),
    book = reportBook(report);
  expect(book.chapters[0].text).not.toContain("uncertainty");
  expect(book.chapters[0].takeaway).toBe(
    "돈을 쓰기 전에 꼭 필요한지 생각해 보거라.",
  );
  expect(book.chapters[1].text).toBe(chapterWarning);
  expect(book.notes).toEqual([note, chapterWarning]);
  expect(JSON.stringify(report)).toBe(original);
});
it("retains a legacy chapter-only technical disclosure in the final notes", async () => {
  const { reportBook } = await import("../lib/report-book");
  const book = reportBook({
    chapters: [
      {
        text: "오늘 마음을 살펴보거라.\nuncertainty: 과거 계산 기록은 별도 검수 필요",
      },
    ],
    chart: {},
  });
  expect(book.notes).toEqual(["과거 계산 기록은 별도 검수 필요"]);
  expect(book.chapters[0].text).toBe("오늘 마음을 살펴보거라.");
});
it("keeps a month heading separate from its short everyday advice", () => {
  const text =
    "각 월의 간지는 양력 15일을 대표 시점으로 삼은 기록이며, 실제 명리월은 절입 시각에 바뀌느니라.\n1월 · 대표 명리월 辛丑 · 천간 십성 비견\n스스로 결정할 일과 함께 의논할 일을 구분해 보거라.";
  expect(chapterTakeaway(text, "ko")).toBe(
    "스스로 결정할 일과 함께 의논할 일을 구분해 보거라.",
  );
});
it("prefers the actual closing action to a sentence introducing it", () => {
  const text =
    "그대의 금서를 덮기 전에 한 가지만 기억하거라. 오늘 고마움을 전할 사람 하나를 적어 보거라.";
  expect(chapterTakeaway(text, "ko")).toBe(
    "오늘 고마움을 전할 사람 하나를 적어 보거라.",
  );
});

it("uses court speech only in a legacy summary while retaining its advice and negation", () => {
  const raw =
    "무리하지 않는 것이 좋습니다. 메모와 우선순위 설정부터 다듬어 보시기를 권합니다.";
  expect(easyTakeaway(raw, "ko")).toBe(
    "무리하지 않는 것이 좋겠구나. 메모와 먼저 할 일 정하기부터 다듬어 보거라.",
  );
  expect(raw).toContain("권합니다");
});
it("prefers everyday resting advice to element counts in a generated chapter", () => {
  const text =
    "오행 수를 보면 화가 4로 가장 많고, 목 1과 금 1, 수 2가 뒤를 받치며, 토 0은 드러난 바가 없느니라. 불이 밝을수록 그 빛을 담는 그릇이 필요하니, 휴식과 정리의 자리를 곁에 두거라.";
  expect(chapterTakeaway(text, "ko")).toBe(
    "불이 밝을수록 그 빛을 담는 그릇이 필요하니, 휴식과 정리의 자리를 곁에 두거라.",
  );
});
it("prefers general monthly wellbeing advice over a technical date convention", () => {
  const text =
    "월별로는 양력 매월 15일 대표 시점의 기록이라 하였으니, 절입 전체 구간으로 넓혀 말하지 말아야 하느니라. 각 달은 별개로 보되, 그때그때 몸과 마음의 리듬을 먼저 살피는 것이 좋느니라.";
  expect(chapterTakeaway(text, "ko")).toBe(
    "각 달은 별개로 보되, 그때그때 몸과 마음의 리듬을 먼저 살피는 것이 좋느니라.",
  );
});
