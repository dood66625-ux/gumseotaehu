import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "../lib/interpretation";
import { syntheticChart } from "../lib/integrations/ai-synthetic-fixtures";
import { reportBook } from "../lib/report-book";
import { reportPdf } from "../lib/pdf";

it("cleans saved authoring-age introductions in both web chapters and exported PDF without changing the source", async () => {
  const report = generate(syntheticChart("known"));
  report.intro = "12살 아이도 알아듣기 쉽게 설명하면, " + report.intro;
  report.chapters[0].text =
    "12살 독자도 이해하기 쉽게 설명하자면, " + report.chapters[0].text;
  const saved = JSON.stringify(report);
  expect(reportBook(report).chapters[0].text).toContain("쉽게 설명하자면");
  expect(reportBook(report).chapters[0].text).not.toContain("12살");
  const pdf = await reportPdf({
    report,
    name: "가상검증",
    created: Date.now(),
    order: {
      id: "synthetic-prose",
      version: 1,
      expires: Date.now() + 86400000,
    },
  } as any);
  const dir = mkdtempSync(join(tmpdir(), "gumseo-customer-prose-"));
  try {
    const path = join(dir, "report.pdf");
    writeFileSync(path, pdf);
    const text = execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf8",
    }).replace(/\s/g, "");
    expect(text).toContain("쉽게설명하자면");
    expect(text).not.toMatch(/12살아이도|12살독자도/);
    expect(text).not.toContain("버전1");
    expect(JSON.stringify(report)).toBe(saved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
