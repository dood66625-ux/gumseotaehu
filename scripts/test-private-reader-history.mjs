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
const report = (i) => ({
  intro: i ? "已儲存的第二卷命書" : "이미 저장한 첫 번째 금서",
  chapters: Array.from({ length: 9 }, () => ({
    text: i
      ? "這是已儲存的解讀，不會重新呼叫模型。"
      : "저장된 풀이입니다. 새 AI 호출을 하지 않습니다.",
  })),
  chart: {
    pillars: ["甲子", "乙丑", "丙寅", null],
    element: "화",
    day: "丙",
    cycles: [],
  },
  notes: ["가상 브라우저 검증 기록"],
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
        locale: i ? "zh-TW" : "ko",
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
      locale: index ? "zh-TW" : "ko",
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
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("http://127.0.0.1:3460/private-reading#reading=" + ids[1]);
    await page.getByText(report(1).intro, { exact: true }).waitFor();
    await page.locator("#toc a").nth(3).click();
    await page.reload();
    await page.getByText(report(1).intro, { exact: true }).waitFor();
    if (!(await page.locator("#birth-form").isHidden()))
      throw Error("SAVED_FORM_NOT_COLLAPSED");
    await page.locator("#show-saved").click();
    await page.locator("#saved-list button").first().click();
    await page.getByText(report(0).intro, { exact: true }).waitFor();
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
