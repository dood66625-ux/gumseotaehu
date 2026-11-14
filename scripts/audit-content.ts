import { mkdirSync, writeFileSync } from "node:fs";
import { calculate, type Birth } from "../lib/astrology";
import { generate, preview } from "../lib/interpretation";
import { reportPdf } from "../lib/pdf";
import type { getReport } from "../lib/service";
const root = "var/content-review";
mkdirSync(root, { recursive: true, mode: 0o700 });
const base: Birth = {
  name: "가상검수",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "female",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
const cases = Array.from({ length: 10 }, (_, i) => ({
  ...base,
  date: `1995-05-${i + 10}`,
})).concat([
  { ...base, time: null },
  { ...base, sex: "unspecified" },
]);
const rows = [];
for (const [i, input] of cases.entries()) {
  const chart = calculate(input),
    report = generate(chart),
    free = preview(chart);
  rows.push({
    fixture: i + 1,
    day: chart.day,
    hourKnown: !!input.time,
    cycles: chart.cycles.length,
    chapterLengths: report.chapters.map((c) => c.text.length),
    distinctParagraphs: new Set(
      report.chapters.flatMap((c) => c.text.split(/\n\n/)),
    ).size,
  });
  writeFileSync(
    `${root}/sample-${i + 1}.json`,
    JSON.stringify({ synthetic: true, input, free, report }, null, 2),
    { mode: 0o600 },
  );
  if ([0, 10, 11].includes(i)) {
    const data = {
      name: input.name,
      created: Date.UTC(2026, 10, 14),
      report,
      order: {
        id: "synthetic-review",
        version: 1,
        expires: Date.UTC(2027, 10, 14),
      },
    } as ReturnType<typeof getReport>;
    writeFileSync(`${root}/sample-${i + 1}.pdf`, await reportPdf(data), {
      mode: 0o600,
    });
  }
}
writeFileSync(
  `${root}/summary.json`,
  JSON.stringify(
    { syntheticOnly: true, liveAi: false, expertApproved: false, rows },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "12 synthetic cases reviewed; JSON and 3 PDFs saved under ignored var/content-review. No external calls. Human/expert review still required.",
);
