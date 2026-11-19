import { z } from "zod";
import { config } from "./config";
import { localBirthSchema, calculateLocal } from "./astrology-core";
export { tenGod, ageAtKstDate, assertSubjectAge } from "./astrology-core";
export const birthSchema = localBirthSchema.extend({
  place: z.literal("KR").default("KR"),
  name: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[가-힣a-zA-Z0-9 _-]+$/, "별명은 한글·영문·숫자로 입력해 주세요."),
});
export type Birth = z.infer<typeof birthSchema>;
export function calculate(raw: unknown) {
  const input = birthSchema.parse(raw);
  if (
    Number(input.date.slice(0, 4)) < 1989 ||
    Number(input.date.slice(0, 4)) > 2030
  )
    throw Error("현재 검증판은 1989~2030년 한국 출생만 지원합니다.");
  return calculateLocal(input, config().year);
}
export type Chart = ReturnType<typeof calculate>;
