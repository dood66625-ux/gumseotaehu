/** Browser-only recovery fixture. A POST is a failure; no AI credentials or provider are used. */
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const ids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
];
let writes = 0,
  release,
  started,
  hold = false;
const calculationNote =
  "한국 음력·절기 독립 대조 및 전문가 검수가 완료되지 않은 로컬 검증 결과입니다.";
const report = (i) => ({
  intro: i ? "이미 저장한 두 번째 금서" : "이미 저장한 첫 번째 금서",
  chapters: Array.from({ length: 9 }, () => ({
    text: i
      ? "저장된 두 번째 풀이입니다. 다시 생성하지 않습니다."
      : "저장된 풀이입니다. 새 AI 호출을 하지 않습니다.\nuncertainty: " +
        calculationNote,
  })),
  chart: {
    pillars: ["甲子", "乙丑", "丙寅", null],
    element: "화",
    day: "丙",
    cycles: [],
  },
  notes: [calculationNote, "가상 브라우저 검증 기록"],
});
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1:3460").pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.method !== "GET") {
    writes++;
    json({ code: "UNEXPECTED_GENERATION" }, 400);
    return;
  }
  if (path === "/private-reading/history") {
    json({
      readings: ids.map((id, i) => ({
        id,
        locale: "ko",
        state: "ready",
        created: Date.now() - i * 1000,
      })),
    });
    return;
  }
  if (
    path === "/private-reading/latest" ||
    path.startsWith("/private-reading/result/")
  ) {
    const index = path.endsWith(ids[1]) ? 1 : 0;
    if (hold && !index)
      await new Promise((r) => {
        release = r;
        started?.();
      });
    json({
      id: ids[index],
      locale: "ko",
      state: "ready",
      report: report(index),
    });
    return;
  }
  const files = {
    "/private-reading": ["public/private-reader/index.html", "text/html"],
    "/private-reading/reader.js": [
      "public/private-reader/reader.js",
      "text/javascript",
    ],
    "/private-reading/style.css": [
      "public/private-reader/style.css",
      "text/css",
    ],
  };
  if (files[path]) {
    res.writeHead(200, { "Content-Type": files[path][1] });
    res.end(readFileSync(files[path][0]));
    return;
  }
  if (/^\/private-reading\/chapter-0[1-9]\.jpg$/.test(path)) {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(readFileSync("public/report-art/" + path.split("/").pop()));
    return;
  }
  json({ code: "NOT_FOUND" }, 404);
});
await new Promise((r) => server.listen(3460, "127.0.0.1", r));
const browser = await chromium.launch();
mkdirSync("var/private-reader", { recursive: true, mode: 0o700 });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      locale: "zh-TW",
    });
    await page.goto("http://127.0.0.1:3460/private-reading#reading=" + ids[1]);
    await page.getByText(report(1).intro, { exact: true }).waitFor();
    if (
      !(await page.locator("#chapter-0").evaluate((article) => {
        const summary = article.querySelector(".chapter-takeaway"),
          body = article.querySelector(".chapter-copy:last-of-type");
        return (
          !!summary &&
          !!body &&
          !!(
            body.compareDocumentPosition(summary) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )
        );
      }))
    )
      throw Error("CHAPTER_TAKEAWAY_NOT_AFTER_BODY");
    if ((await page.locator("#chapters article:visible").count()) !== 1)
      throw Error("BOOK_NOT_SINGLE_PAGE");
    if (
      (await page
        .locator("#chapters article:visible .chapter-takeaway")
        .count()) !== 1
    )
      throw Error("TAKEAWAY_MISSING");
    if (
      (await page
        .locator("#chapters article:visible .chapter-takeaway span")
        .textContent()) !== "이 장의 한마디"
    )
      throw Error("TAKEAWAY_LOCALE");
    await page.locator("#book-next").click();
    if ((await page.locator("#book-position").textContent()) !== "2 / 12")
      throw Error("BOOK_NEXT_FAILED");
    await page.locator("#book-prev").click();
    await page.locator("#toc a").nth(3).click();
    await page.reload();
    await page.getByText(report(1).intro, { exact: true }).waitFor();
    if ((await page.locator("#book-position").textContent()) !== "4 / 12")
      throw Error("BOOK_PAGE_NOT_REMEMBERED");
    if (
      (await page.locator("#locale").isVisible()) ||
      (await page.locator('#place option[value="TW"]').count())
    )
      throw Error("TAIWAN_UI_VISIBLE");
    if ((await page.locator("html").getAttribute("lang")) !== "ko")
      throw Error("KOREAN_ONLY_LANGUAGE");
    await page.locator('#toc a[href="#book-portrait"]').click();
    await page.locator("#book-portrait .court-choices button").first().click();
    if (
      (await page
        .locator('#book-portrait button[aria-pressed="true"]')
        .count()) !== 1
    )
      throw Error("CHOICE_NOT_SELECTED");
    await page.locator("#book-portrait .court-choices button").nth(1).click();
    if (
      (await page
        .locator('#book-portrait button[aria-pressed="true"]')
        .count()) !== 1
    )
      throw Error("MULTIPLE_CHOICES_SELECTED");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("PORTRAIT_OVERFLOW");
    await page
      .locator("#book")
      .screenshot({ path: `var/private-reader/portrait-${width}.png` });
    await page.locator('#toc a[href="#book-figures"]').click();
    if ((await page.locator("#book-figures .figure-card").count()) !== 3)
      throw Error("FIGURE_COUNT");
    if (
      !(await page.locator("#book-figures").textContent()).includes("허난설헌")
    )
      throw Error("FIGURE_KOREAN_ONLY");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("FIGURE_OVERFLOW");
    await page
      .locator("#book")
      .screenshot({ path: `var/private-reader/figures-korean-${width}.png` });
    await page.locator("#toc a").last().click();
    if (!(await page.locator("#book-next").isDisabled()))
      throw Error("BOOK_END_BOUNDARY");
    await page.emulateMedia({ media: "print" });
    if ((await page.locator("#chapters article:visible").count()) !== 11)
      throw Error("PRINT_LOST_CHAPTERS");
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.locator("#toc a").first().click();
    if (
      (await page
        .locator("#chapter-0")
        .evaluate((node) => getComputedStyle(node).animationName)) !== "none"
    )
      throw Error("REDUCED_MOTION_IGNORED");
    if (!(await page.locator("#birth-form").isHidden()))
      throw Error("SAVED_FORM_NOT_COLLAPSED");
    await page.locator("#show-saved").click();
    await page.locator("#saved-list button").first().click();
    await page.getByText(report(0).intro, { exact: true }).waitFor();
    if (
      (await page.locator("#chapters").textContent()).includes("uncertainty:")
    )
      throw Error("INTERNAL_LABEL_VISIBLE");
    if (
      (await page.locator("#chapters").textContent()).includes(calculationNote)
    )
      throw Error("GLOBAL_NOTE_REPEATED");
    await page.locator("#toc a").last().click();
    await page.locator("#notes-title").click();
    if (!(await page.locator("#notes").textContent()).includes(calculationNote))
      throw Error("CALCULATION_DISCLOSURE_LOST");
    await page.locator('#toc a[href="#book-figures"]').click();
    if (
      !(await page.locator("#book-figures").textContent()).includes("허난설헌")
    )
      throw Error("FIGURE_KO_LOCALE");
    await page
      .locator("#book")
      .screenshot({ path: `var/private-reader/figures-ko-${width}.png` });
    await page.locator("#toc a").first().click();
    if (
      (await page
        .locator("#chapters article:visible .chapter-takeaway span")
        .textContent()) !== "이 장의 한마디"
    )
      throw Error("KO_TAKEAWAY_LOCALE");
    await page
      .locator("#book")
      .screenshot({ path: `var/private-reader/book-${width}.png` });
    if (!page.url().endsWith(ids[0])) throw Error("SAVED_BOOKMARK_MISSING");
    await page.reload();
    await page.getByText(report(0).intro, { exact: true }).waitFor();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("SAVED_HISTORY_OVERFLOW");
    await page
      .locator("#saved-readings")
      .screenshot({ path: `var/private-reader/history-${width}.png` });
    hold = true;
    release = undefined;
    const waiting = new Promise((r) => {
      started = r;
    });
    await page.goto(
      "http://127.0.0.1:3460/private-reading?test=delayed#reading=" + ids[0],
    );
    await waiting;
    await page.locator("#saved-list button").nth(1).click();
    await page.getByText(report(1).intro, { exact: true }).waitFor();
    if (!release) throw Error("DELAYED_REQUEST_NOT_STARTED");
    release();
    hold = false;
    await page.waitForLoadState("networkidle");
    if ((await page.locator("#intro").textContent()) !== report(1).intro)
      throw Error("STALE_SAVED_REPORT_OVERWROTE_SELECTION");
    await page.close();
  }
  if (writes) throw Error("REOPEN_SENT_GENERATION_REQUEST");
  console.log(
    JSON.stringify({
      passed: true,
      widths: [390, 1440],
      historySelection: true,
      chapterPaging: true,
      chapterTakeaways: true,
      historicalFigures: true,
      koreanOnly: true,
      courtPortrait: true,
      interactiveChoice: true,
      rememberedPage: true,
      printAllChapters: true,
      reducedMotion: true,
      disclosuresAtEnd: true,
      bookmarkReload: true,
      staleResponseIgnored: true,
      generationRequests: writes,
    }),
  );
} finally {
  release?.();
  await browser.close();
  await new Promise((r) => server.close(r));
}
