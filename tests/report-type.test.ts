import { expect, it } from "vitest";
import { reportType } from "../lib/report-type";
it("chooses exactly one distinct type for each chart label and keeps it stable", () => {
  const gods = [
    "편관",
    "정인",
    "편재",
    "편인",
    "식신",
    "상관",
    "정재",
    "정관",
    "비견",
    "겁재",
  ];
  const names = gods.map((god, index) => {
    const chart = { tenGods: [null, god, "비견", null], element: "목" };
    const before = JSON.stringify(chart);
    const type = reportType(chart);
    expect(type.imageIndex).toBe(index);
    expect(reportType({ ...chart })).toEqual(type);
    expect(JSON.stringify(chart)).toBe(before);
    return type.name;
  });
  expect(new Set(names).size).toBe(10);
  expect(names).toEqual(
    expect.arrayContaining([
      "권력형",
      "과학자형",
      "사업가형",
      "분석가형",
      "발명가형",
    ]),
  );
});
it("uses the known element when birth time or chart labels are missing without making new pillars", () => {
  expect(
    reportType({ element: "수", tenGods: [null, null, null, null] }).name,
  ).toBe("분석가형");
  const type = reportType({
    element: "금",
    tenGods: [null, "식신", null, null],
  });
  expect(type.name).toBe("발명가형");
  expect(type.shareUrl).toBe("https://gumseo.kr/?from=type-share");
  expect(type.shareText).not.toMatch(/생년|이메일|reading=|order|report\//);
});
