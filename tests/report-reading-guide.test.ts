import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import { generate } from "../lib/interpretation";
import { syntheticChart } from "../lib/integrations/ai-synthetic-fixtures";
import { readingGuide } from "../lib/report-reading-guide";
it("keeps missing cycles explicit and does not rewrite the saved report", () => {
  const report = generate(syntheticChart("unknown"));
  const before = JSON.stringify(report);
  const guide = readingGuide(report);
  expect(guide.points[3].text).toContain("구간을 제시하지 않았어요");
  expect(guide.glossary).toHaveLength(4);
  expect(JSON.stringify(report)).toBe(before);
});
it("uses a bundled local illustration for every element without remote images", () => {
  const report = generate(syntheticChart("known"));
  for (const element of ["목", "화", "토", "금", "수"]) {
    report.chart.element = element;
    const guide = readingGuide(report);
    expect(guide.artwork).toMatch(/^\/report-art\/[a-z]+\.png$/);
    expect(existsSync("public" + guide.artwork)).toBe(true);
  }
});
