import { expect, it } from "vitest";
import { taehouNarration } from "../lib/taehou-narration";
it("keeps facts and negation while replacing formal narrative endings", () => {
  const input =
    "2027년 구간입니다. 32세부터 시작합니다. 성공을 보장하지 않습니다. 없는 값을 만들지 않습니다.";
  const result = taehouNarration(input);
  expect(result).toContain("2027년");
  expect(result).toContain("32세");
  expect(result).toContain("보장하지 않느니라");
  expect(result).toContain("만들지 않느니라");
  expect(result).not.toMatch(/습니다|합니다|입니다/);
  expect(taehouNarration(result)).toBe(result);
});
it("leaves existing persona advice and conditions intact", () => {
  const text = "시간을 모르면 제외하거라. 서두르지 말거라.";
  expect(taehouNarration(text)).toBe(text);
});
