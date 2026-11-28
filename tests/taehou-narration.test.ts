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

it.each([
  "12살 아이도 알아듣기 쉽게 설명하면",
  "12살 독자도 알아들을 쉬운 표현으로 풀어보면",
  "열두 살 어린이도 이해하기 쉽게 말하자면",
  "12세 학생도 이해할 수 있게 설명하자면",
  "초등학생도 이해하기 쉽게 설명하면",
])(
  "turns internal reader-age framing into natural customer prose: %s",
  (intro) => {
    const raw = intro + ", 그대의 목 기운은 새싹을 돌보는 모습과 같구나.";
    const shown = taehouNarration(raw);
    expect(shown).toBe(
      "쉽게 설명하자면, 그대의 목 기운은 새싹을 돌보는 모습과 같구나.",
    );
    expect(taehouNarration(shown)).toBe(shown);
    expect(raw).toContain(intro);
  },
);
it("preserves actual age ranges, counts and limitations", () => {
  const facts =
    "12세부터 21세까지의 구간이니라. 목 2 · 화 1 · 토 2 · 금 1 · 수 2. 시간 미상이면 시주는 제외하느니라.";
  expect(taehouNarration(facts)).toBe(facts);
});
