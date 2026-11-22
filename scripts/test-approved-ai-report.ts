/** Display QA for the immutable paid synthetic sample. Payload delivery is mocked; no auth/PG/AI claims. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { decryptJson } from "../lib/crypto";
import { extendedReviewApproval } from "../lib/approved-synthetic-review";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import type { Report } from "../lib/interpretation";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const root = resolve("var/approved-korean-review-20261122-extended"),
  key = Buffer.from(process.env.DATA_KEY ?? "", "hex");
const db = new DatabaseSync(join(root, "one-call.sqlite"), { readOnly: true });
let report: Report, calls: number;
try {
  report = decryptJson<Report>(
    String(
      db
        .prepare("SELECT report_enc FROM approved_review WHERE id=?")
        .get(extendedReviewApproval.id)!.report_enc,
    ),
    key,
  );
  calls = Number(db.prepare("SELECT count(*) n FROM ai_spend_calls").get()!.n);
} finally {
  db.close();
}
const expected = JSON.parse(readFileSync(join(root, "evidence.json"), "utf8"));
if (
  createHash("sha256").update(JSON.stringify(report)).digest("hex") !==
  expected.reportDigest
)
  throw Error("SAVED_REPORT_CHANGED");
const directory = mkdtempSync(join(root, "display-check-")),
  origin = "http://127.0.0.1:3349";
let server: ChildProcess | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let blockedRequests = 0,
  payloadReads = 0;
try {
  const created = Date.now(),
    payload = {
      name: "가상검증",
      created,
      report,
      birth: syntheticBirths.known,
      order: {
        id: extendedReviewApproval.orderId,
        version: 1,
        expires: created + 86400000,
      },
    };
  const pdf = readFileSync(join(root, "known-v3.pdf"));
  server = spawn(process.execPath, ["--import", "tsx", "scripts/start.ts"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      APP_MODE: "local",
      EXTERNAL_EFFECTS: "disabled",
      APP_ORIGIN: origin,
      DATABASE_PATH: join(directory, "isolated.sqlite"),
      DATA_KEY: randomBytes(32).toString("hex"),
      AUTH_SECRET: randomBytes(32).toString("hex"),
      ADMIN_PASSWORD: randomBytes(32).toString("hex"),
      ADMIN_TOTP_SECRET: randomBytes(20).toString("hex"),
      PORT: "3349",
      GEUMSEO_BIND_HOST: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + "/api/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blockedRequests++;
      return route.abort();
    }
    if (url.pathname === "/api/reports/" + extendedReviewApproval.orderId) {
      payloadReads++;
      return route.fulfill({ json: payload });
    }
    if (
      url.pathname ===
      "/api/reports/" + extendedReviewApproval.orderId + "/pdf"
    )
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: pdf,
      });
    if (url.pathname.startsWith("/api/")) {
      blockedRequests++;
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage(),
    screenshots: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + "/report/" + extendedReviewApproval.orderId);
    await expect(page.locator(".report-chapter")).toHaveCount(9);
    await expect(page.locator(".chapter-illustration img")).toHaveCount(9);
    await expect(
      page.locator('aside[aria-label="이 장의 한마디"]'),
    ).toHaveCount(9);
    expect(
      await page.locator(".report-chapter").evaluateAll((articles) =>
        articles.every((article) => {
          const body =
            article.querySelector(":scope > figure")?.nextElementSibling;
          const summary = article.querySelector(
            'aside[aria-label="이 장의 한마디"]',
          );
          return (
            !!body &&
            body.tagName === "P" &&
            !!summary &&
            !!(
              body.compareDocumentPosition(summary) &
              Node.DOCUMENT_POSITION_FOLLOWING
            )
          );
        }),
      ),
    ).toBe(true);
    await page
      .locator(".chapter-illustration img")
      .evaluateAll(async (images) => {
        for (const image of images as HTMLImageElement[]) {
          image.loading = "eager";
          await image.decode();
        }
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const file = "approved-report-" + width + ".png";
    await page
      .locator(".report-chapter")
      .first()
      .screenshot({ path: join(root, file) });
    screenshots.push(file);
  }
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PDF 다운로드", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs(join(root, "browser-downloaded.pdf"));
  expect(
    createHash("sha256")
      .update(readFileSync(join(root, "browser-downloaded.pdf")))
      .digest("hex"),
  ).toBe(createHash("sha256").update(pdf).digest("hex"));
  expect(blockedRequests).toBe(0);
  expect(payloadReads).toBe(2);
  const evidence = {
    scope:
      "saved synthetic AI content; mocked report/PDF delivery; local real browser rendering",
    syntheticOnly: true,
    promptVersion: report.promptVersion,
    widths: [390, 1440],
    chapterImages: 9,
    chapterTakeaways: 9,
    chapterTakeawaysAfterBody: true,
    horizontalOverflow: false,
    pdfDownloadMatches: true,
    providerRequests: 0,
    realDeviceVerified: false,
    liveAuthenticationVerified: false,
    screenshots,
  };
  writeFileSync(
    join(root, "browser-evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const stopped = new Promise<void>((done) =>
      server!.once("exit", () => done()),
    );
    server.kill("SIGTERM");
    await stopped;
  }
  rmSync(directory, { recursive: true, force: true });
  const check = new DatabaseSync(join(root, "one-call.sqlite"), {
    readOnly: true,
  });
  try {
    if (
      Number(
        check.prepare("SELECT count(*) n FROM ai_spend_calls").get()!.n,
      ) !== calls!
    )
      throw Error("UNEXPECTED_PROVIDER_CALL");
  } finally {
    check.close();
  }
}
