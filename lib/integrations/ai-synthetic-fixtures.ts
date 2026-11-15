/** Publicly invented fixtures only. No user input is accepted by the live test runner. */
import { calculate, type Birth } from "../astrology";
export const syntheticModel = "gpt-5.4-mini-2026-03-17";
export const syntheticBirths: Record<"known" | "unknown", Birth> = {
  known: {
    name: "가상검증",
    date: "1995-05-15",
    calendar: "solar",
    leap: false,
    time: "10:30",
    sex: "female",
    place: "KR",
    age: "19+",
    self: true,
    consent: true,
  },
  unknown: {
    name: "가상검증",
    date: "1998-10-12",
    calendar: "solar",
    leap: false,
    time: null,
    sex: "unspecified",
    place: "KR",
    age: "19+",
    self: true,
    consent: true,
  },
};
export type SyntheticFixture = keyof typeof syntheticBirths;
export function syntheticChart(fixture: SyntheticFixture) {
  if (!Object.hasOwn(syntheticBirths, fixture))
    throw Error("SYNTHETIC_FIXTURE_REQUIRED");
  return calculate(syntheticBirths[fixture]);
}
