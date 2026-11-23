import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const server = spawn(process.execPath, ["scripts/serve-public-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_BASE_PATH: "",
    PREVIEW_OUTPUT: "public/merchant-review",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((r) => server.stdout.once("data", r));
  browser = await chromium.launch();
  mkdirSync("var/portrait-reading", { recursive: true });
  const page = await browser.newPage();
  for (const [width, height] of [
    [390, 664],
    [320, 568],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const screen of ["preview", "checkout"]) {
      await page.goto(
        "http://127.0.0.1:3200/?screen=" +
          screen +
          "&id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
      await page
        .locator(screen === "preview" ? ".screen-flow" : ".checkout-flow")
        .waitFor();
      let index = 0;
      const expressions = new Set();
      while (true) {
        await page.evaluate(() => scrollTo(0, 0));
        if (screen === "preview") {
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(800);
          if (
            await page.evaluate(
              () => document.documentElement.scrollHeight > innerHeight + 1,
            )
          )
            throw Error(`PAGE_SCROLL_${width}_${index}`);
          if (
            await page.getByText("이 풀이의 계산 근거", { exact: true }).count()
          )
            throw Error("CALCULATION_EVIDENCE_VISIBLE");
          if (index === 0)
            await page.screenshot({
              path: `var/portrait-reading/first-${width}.png`,
            });
        }

        if (screen === "preview") {
          const face = page.locator(
            ".screen-flow-page:not([hidden]) .empress-expression",
          );
          if ((await face.count()) !== 1) throw Error("PORTRAIT_MISSING");
          expressions.add(
            await face.evaluate((n) => {
              const css = getComputedStyle(n);
              return css.backgroundImage + css.backgroundPosition;
            }),
          );
          const bounds = await face.boundingBox();
          if (!bounds || bounds.width < 50) throw Error("PORTRAIT_TOO_SMALL");
        }
        const controls = page.locator(".screen-flow-controls");
        const rect = await controls.evaluate((n) => ({
          bottom: n.getBoundingClientRect().bottom,
          over: document.documentElement.scrollWidth > innerWidth,
        }));
        if (rect.over || rect.bottom > height)
          throw Error(`${screen}_${width}_${index}_bottom_${rect.bottom}`);
        const next = controls.getByRole("button", { name: "다음 →" });
        if (!(await next.count()) || (await next.isDisabled())) {
          if (
            screen === "preview" &&
            !(await page
              .getByRole("link", { name: "22,000원 결제 후 운명서 펼쳐보기" })
              .isVisible())
          )
            throw Error("PURCHASE_MUST_BE_LAST");
          if (screen === "preview") {
            await page
              .getByRole("button", { name: "아홉 장에 담긴 금기 목록" })
              .click();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            if ((await dialog.locator("li").count()) !== 9)
              throw Error("CHAPTER_POPUP_COUNT");
            await page.screenshot({
              path: `var/portrait-reading/list-${width}.png`,
            });
            await page.getByRole("button", { name: "금기 목록 닫기" }).click();
            if (await dialog.isVisible()) throw Error("CHAPTER_POPUP_CLOSE");
            await page.screenshot({
              path: `var/portrait-reading/final-${width}.png`,
            });
          }
          if (screen === "preview" && expressions.size !== index + 1)
            throw Error("REPEATED_EXPRESSION");
          if (screen === "preview") {
            await page.emulateMedia({ reducedMotion: "reduce" });
            if (
              (await page
                .locator(".screen-flow-page:not([hidden])")
                .evaluate((n) => getComputedStyle(n).animationName)) !== "none"
            )
              throw Error("REDUCED_MOTION");
            await page.emulateMedia({ reducedMotion: "no-preference" });
          }

          break;
        }
        await next.click();
        index++;
        if (index > 40) throw Error("PAGING_LOOP");
      }
    }
  }
  console.log(
    "Preview and review checkout screens fit 390x664, 320x568, 1440x900; no payment submitted",
  );
} finally {
  await browser?.close();
  server.kill();
}
