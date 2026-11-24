import { expect, it } from "vitest";
import {
  formatBirthDateInput,
  birthDateInputError,
} from "../lib/birth-date-input";
it("formats typed and pasted dates without keeping unrelated characters", () => {
  for (const input of ["19950515", "1995-05-15", "1995/05/15"])
    expect(formatBirthDateInput(input)).toBe("1995-05-15");
  expect(formatBirthDateInput("19950")).toBe("1995-0");
  expect(formatBirthDateInput("")).toBe("");
  expect(formatBirthDateInput("199505159999")).toBe("1995-05-15");
});
it("rejects impossible solar dates and handles leap years", () => {
  for (const input of [
    "1995-02-29",
    "2000-04-31",
    "2000-13-01",
    "2000-00-10",
    "2000-01-00",
    "2000-01-32",
    "2000-2-3",
    "1988-01-01",
    "2031-01-01",
  ])
    expect(birthDateInputError(input, "solar")).not.toBe("");
  for (const input of ["2000-02-29", "1995-05-15", "1989-01-01"])
    expect(birthDateInputError(input, "solar")).toBe("");
});
it("checks lunar input shape without rejecting a possible thirtieth day", () => {
  expect(birthDateInputError("1995-02-30", "lunar")).toBe("");
  expect(birthDateInputError("1995-02-31", "lunar")).not.toBe("");
});
