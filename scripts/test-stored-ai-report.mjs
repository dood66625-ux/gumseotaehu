/** Local saved-report UI check. No model requests; source DB and budget stay untouched. */
import { spawn } from "node:child_process";
import { DatabaseSync, backup } from "node:sqlite";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
process.loadEnvFile(".env.local");
const root = resolve("var/ai-synthetic"),
  proof = JSON.parse(readFileSync(join(root, "unknown-evidence.json"), "utf8"));
const calls = () => {
  const b = new DatabaseSync(join(root, "budget.sqlite"), { readOnly: true });
  try {
    return Number(b.prepare("SELECT COUNT(*) n FROM calls").get().n);
  } finally {
    b.close();
  }
};
const before = calls(),
  dir = mkdtempSync(join(root, "browser-check-")),
  dbPath = join(dir, "journey.sqlite");
let browser, server;
try {
  const source = new DatabaseSync(join(root, "journey.sqlite"), {
    readOnly: true,
  });
  let orderId;
  try {
    orderId = source
      .prepare("SELECT order_id FROM reports WHERE id=?")
      .get(proof.reportId)?.order_id;
    if (!orderId) throw Error("STORED_REPORT_NOT_FOUND");
    await backup(source, dbPath);
  } finally {
    source.close();
  }
  chmodSync(dbPath, 0o600);
  // Fresh test-fixture authentication window only in a disposable copy. Never reset source controls.
  const clone = new DatabaseSync(dbPath);
  clone.exec("DELETE FROM rate_limits");
  clone.close();
  const origin = "http://127.0.0.1:3440";
  server = spawn(process.execPath, ["--import", "tsx", "scripts/start.ts"], {
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      APP_ORIGIN: origin,
      PORT: "3440",
    },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  const post = (path, data = {}) =>
    page.request.post(origin + "/api/" + path, { headers: { origin }, data });
  await post("session");
  const req = await post("auth/request", {
    email: "synthetic-unknown@example.invalid",
  });
  if (!req.ok()) throw Error("SYNTHETIC_AUTH_FAILED");
  const challenge = await req.json(),
    code = await (
      await page.request.get(
        origin + "/api/local-mail/" + challenge.challengeId,
      )
    ).json();
  if (
    !(
      await post("auth/verify", {
        challengeId: challenge.challengeId,
        code: code.code,
      })
    ).ok()
  )
    throw Error("SYNTHETIC_AUTH_FAILED");
  const response = await page.request.get(origin + "/api/reports/" + orderId);
  if (!response.ok()) throw Error("STORED_REPORT_HTTP_FAILED");
  const result = await response.json();
  if (
    result.report.provider !== "openai" ||
    createHash("sha256").update(JSON.stringify(result.report)).digest("hex") !==
      proof.reportDigest
  )
    throw Error("STORED_REPORT_CHANGED");
  await page.goto(origin + "/report/" + orderId);
  await page.getByText("AI 해석 운명서", { exact: false }).waitFor();
  if (
    (await page
      .locator('.report-chapter aside[aria-label="이 장의 한마디"]')
      .count()) !== 9
  )
    throw Error("CHAPTER_TAKEAWAYS_MISSING");
  const takeaways = await page
    .locator('.report-chapter aside[aria-label="이 장의 한마디"] .quote')
    .allTextContents();
  if (takeaways.some((text) => !text.trim() || text.includes("uncertainty:")))
    throw Error("INVALID_CHAPTER_TAKEAWAY");
  if (
    (await page.locator(".report-chapter").allTextContents()).some((text) =>
      text.includes("uncertainty:"),
    )
  )
    throw Error("REPEATED_TECHNICAL_LABEL");
  const screenshots = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const chapter = page.locator(".report-chapter").first();
    await chapter.scrollIntoViewIfNeeded();
    await page
      .locator(".chapter-illustration img")
      .evaluateAll(async (images) => {
        for (const image of images) {
          image.loading = "eager";
          await image.decode();
        }
      });
    if ((await page.locator(".chapter-illustration img").count()) !== 9)
      throw Error("CHAPTER_ART_MISSING");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("REPORT_HORIZONTAL_OVERFLOW");
    const file = `illustrated-report-${width}.png`;
    await chapter.screenshot({ path: join(root, file) });
    screenshots.push(file);
    await page.goto(origin + "/report/" + orderId);
    await page
      .getByRole("button", { name: "PDF 다운로드", exact: true })
      .waitFor();
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await (await download).saveAs(join(root, "unknown-browser-report.pdf"));
  if (
    readFileSync(join(root, "unknown-browser-report.pdf"))
      .subarray(0, 5)
      .toString() !== "%PDF-"
  )
    throw Error("STORED_PDF_INVALID");
  const evidence = {
    fixture: "unknown",
    browser: "mobile Chromium",
    copiedSyntheticDatabase: true,
    sameSavedReport: true,
    visibleAiLabel: true,
    pdfDownload: true,
    chapterIllustrationsLoaded: 9,
    chapterTakeaways: 9,
    repeatedTechnicalLabels: false,
    currentModelQualityApproved: false,
    checkedWidths: [390, 1440],
    screenshots,
    apiCallsDuringBrowserCheck: calls() - before,
    livePayments: false,
    realMail: false,
  };
  if (evidence.apiCallsDuringBrowserCheck !== 0)
    throw Error("UNEXPECTED_AI_CALL");
  writeFileSync(
    join(root, "browser-evidence.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const stopped = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
}
