import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { calculate, type Birth } from "../lib/astrology";
import reference from "./fixtures/kasi-2024.json";
const base: Birth = {
  name: "가상경계검수",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "12:00",
  sex: "female",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
function inputAt(timestamp: number) {
  const kst = new Date(timestamp + 9 * 3600000).toISOString();
  return { ...base, date: kst.slice(0, 10), time: kst.slice(11, 16) };
}
describe("KASI 2024 reference subset, not full astrology certification", () => {
  it.each(reference.monthStarts)(
    "lunar month %s first day matches reference %s",
    (month, date) => {
      expect(
        calculate({
          ...base,
          date: `2024-${String(month).padStart(2, "0")}-01`,
          calendar: "lunar",
        }).solarDate,
      ).toBe(date);
    },
  );
  it.each(reference.monthTerms)(
    "term %s matches reference minute within 60 seconds",
    (name, instant) => {
      const table = Solar.fromYmdHms(2024, 7, 1, 12, 0, 0)
        .getLunar()
        .getJieQiTable();
      const cst = table[name].toYmdHms().replace(" ", "T") + "+08:00";
      expect(
        Math.abs(Date.parse(cst) - Date.parse(instant)),
      ).toBeLessThanOrEqual(60000);
    },
  );
  it.each(reference.monthTerms)(
    "term %s changes month across the reference with safe margin",
    (_name, instant) => {
      const t = Date.parse(instant);
      const before = calculate(inputAt(t - 5 * 60000)),
        after = calculate(inputAt(t + 5 * 60000));
      expect(before.pillars[1]).not.toBe(after.pillars[1]);
    },
  );
  it.each(reference.monthTerms)(
    "term %s refuses unknown time and boundary minute",
    (_name, instant) => {
      const input = inputAt(Date.parse(instant));
      expect(() => calculate({ ...input, time: null })).toThrow(
        "출생일에 절기가",
      );
      expect(() => calculate(input)).toThrow("절기가 바뀌는 시각");
    },
  );
  it("uses KST date at midnight rather than the prior CST date", () => {
    expect(() =>
      calculate({ ...base, date: "2024-12-06", time: null }),
    ).not.toThrow();
    expect(() =>
      calculate({ ...base, date: "2024-12-07", time: null }),
    ).toThrow("절기가");
  });
  it("keeps unknown-time result only when year/month remain constant all day", () => {
    const c = calculate({ ...base, time: null });
    expect(c.pillars[3]).toBeNull();
    expect(c.cycles).toEqual([]);
    const first = calculate({ ...base, time: "00:00" }),
      last = calculate({ ...base, time: "23:59" });
    expect(first.pillars.slice(0, 3)).toEqual(last.pillars.slice(0, 3));
    expect(c.pillars.slice(0, 3)).toEqual(first.pillars.slice(0, 3));
  });
});
