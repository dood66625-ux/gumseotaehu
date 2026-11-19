import { expect, it } from "vitest";
import { bookText } from "../scripts/private-reader/book";
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
