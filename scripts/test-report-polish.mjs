/** Browser-only synthetic reading checks. Never sends a question to an AI provider. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, webkit } from "playwright";
import { measureReportEvidence } from "./report-readability.mjs";
const server = spawn(process.execPath, ["scripts/serve-public-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_BASE_PATH: "",
    PREVIEW_OUTPUT: "var/report-polish",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("exit", (code) => reject(Error("PREVIEW_SERVER_EXIT_" + code)));
  });
  mkdirSync("var/report-polish-checks", { recursive: true });
  for (const [engine, kind] of [
    [chromium, "chromium"],
    [webkit, "webkit"],
  ]) {
    browser = await engine.launch();
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() =>
        sessionStorage.setItem(
          "geumseo-synthetic-preview-v1",
          JSON.stringify({
            authenticated: true,
            paid: true,
            created: true,
            tickets: [],
          }),
        ),
      );
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        "http://127.0.0.1:3200/?screen=report&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      await page.locator(".report-chapter").first().waitFor();
      await page
        .getByRole("heading", { name: "태후에게 자문을 구해보세요 (3/3)" })
        .waitFor();
      const text = await page.locator(".report-reader").innerText();
      if (
        /카카오톡 안에서 PDF|오늘은 어떤 한 걸음|낯선 말이 있었느냐|풀이 근거 살펴보기|계산 기준과 해석의 범위|문의·정정·환불/.test(
          text,
        )
      )
        throw Error("REMOVED_REPORT_COPY_REMAINS");
      const result = await page
        .locator(".report-chapter")
        .evaluateAll(measureReportEvidence);
      if (result.minimumContrast < 4.5)
        throw Error("DETAIL_CONTROL_CONTRAST_" + JSON.stringify(result));
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error("REPORT_HORIZONTAL_OVERFLOW");
      await page
        .locator(".report-chapter")
        .first()
        .getByRole("button", { name: "자세히 보기", exact: true })
        .click();
      const dialog = page.locator("dialog[open]");
      if ((await dialog.locator(".readable-text p").count()) < 2)
        throw Error("DETAIL_PARAGRAPHS_MISSING");
      if ((await dialog.locator("strong").count()) < 1)
        throw Error("DETAIL_EMPHASIS_MISSING");
      await dialog.screenshot({
        path: `var/report-polish-checks/detail-${kind}-${width}.png`,
      });
      await dialog.getByRole("button", { name: "상세 풀이 닫기" }).click();
      const input = page.getByLabel("태후에게 올릴 물음");
      await input.fill("가".repeat(70));
      if ((await input.inputValue()).length !== 50)
        throw Error("QUESTION_LENGTH_NOT_LIMITED");
      await input.fill("내 장점을 어떻게 살리면 좋을까요?");
      await page
        .locator(".taehou-counsel")
        .screenshot({
          path: `var/report-polish-checks/counsel-${kind}-${width}.png`,
        });
      if (errors.length) throw Error("BROWSER_ERROR_" + errors.join("|"));
      console.log(
        JSON.stringify({
          engine: kind,
          width,
          detailContrast: result.minimumContrast,
          removedCopy: true,
          paragraphs: true,
          counselLimit: 50,
        }),
      );
      await page.close();
    }
    await browser.close();
    browser = null;
  }
} finally {
  await browser?.close();
  server.kill();
}
