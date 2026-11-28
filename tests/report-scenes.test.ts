import { REPORT_WEB_PAGE_COUNT } from "../lib/product";
import { expect, it } from "vitest";
import { reportScenes } from "../lib/report-scenes";
import { generate } from "../lib/interpretation";
import { syntheticChart } from "../lib/integrations/ai-synthetic-fixtures";
import { reportBook } from "../lib/report-book";
it.each(["known", "unknown"] as const)(
  "reuses every chapter and the closing letter without changing the saved %s report",
  (fixture) => {
    const report = generate(syntheticChart(fixture)),
      before = JSON.stringify(report),
      book = reportBook(report);
    const scenes = reportScenes(report, "가온");
    expect(scenes.length + 2).toBe(REPORT_WEB_PAGE_COUNT);
    expect(scenes[0].key).toBe("welcome");
    expect(scenes[1].key).toBe("type");
    expect(scenes.at(-1)?.key).toBe("letter");
    expect(new Set(scenes.map((s) => s.key)).size).toBe(scenes.length);
    report.chapters.forEach((chapter, i) => {
      const scene = scenes.find((s) => s.key === "chapter-" + i)!;
      expect(scene.title).toBe(chapter.title);
      expect(scene.text).toContain(book.chapters[i].text);
      if (book.chapters[i].practice)
        expect(scene.text).toContain(book.chapters[i].practice);
    });
    expect(scenes.some((s) => s.title === "나와 맞는 직업 TOP3")).toBe(true);
    expect(scenes.at(-1)!.text.length).toBeGreaterThan(800);
    expect(JSON.stringify(report)).toBe(before);
  },
);
