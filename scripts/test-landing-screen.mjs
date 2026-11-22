/** Synthetic static UI only: no customer data, API credentials, or generation. */
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
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
    server.once("exit", (code) => reject(Error("PREVIEW_EXIT_" + code)));
  });
  browser = await chromium.launch();
  const page = await browser.newPage();
  mkdirSync("var/landing-motion", { recursive: true });
  for (const [width, height] of [
    [390, 844],
    [375, 667],
    [320, 568],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:3200/");
    await page.getByRole("link", { name: "내 사주 펼쳐보기" }).waitFor();
    const fits = await page.evaluate(() => {
      const cta = document.querySelector(".hero-cta").getBoundingClientRect();
      return (
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth &&
        cta.top >= 0 &&
        cta.bottom <= innerHeight
      );
    });
    if (!fits) throw Error("LANDING_NOT_ONE_SCREEN_" + width);
    if (await page.locator("#portrait-motion").count())
      throw Error("PAUSE_CONTROL_REMAINS");
    await page.screenshot({
      path: "var/landing-motion/main-" + width + ".png",
    });
    await page.locator(".landing-more > summary").click();
    await page.locator(".book-price").waitFor({ state: "visible" });
    if (!(await page.locator("footer").isVisible()))
      throw Error("BUSINESS_FOOTER_MISSING");
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (
      (await page
        .locator(".hero-portrait img")
        .evaluate((n) => getComputedStyle(n).animationName)) !== "none"
    )
      throw Error("REDUCED_MOTION_FAILED");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  for (const [width, height] of [
    [390, 664],
    [375, 667],
    [320, 568],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:3200/?screen=start");
    await page.locator(".birth-wizard").waitFor();
    for (let step = 0; step < 3; step++) {
      await page.waitForTimeout(250);
      await page.evaluate(() => scrollTo(0, 0));
      if (
        await page
          .locator(".birth-step-actions")
          .evaluate((n) => n.getBoundingClientRect().bottom > innerHeight)
      )
        throw Error(
          "BIRTH_ACTION_BELOW_SCREEN_" +
            width +
            "_" +
            step +
            "_" +
            (await page
              .locator(".birth-step-actions")
              .evaluate((n) => n.getBoundingClientRect().bottom)),
        );
      const contained = await page
        .locator(".birth-wizard fieldset:visible")
        .evaluate((frame) => {
          const bounds = frame.getBoundingClientRect();
          return [...frame.querySelectorAll("input,select")].every((n) => {
            const r = n.getBoundingClientRect();
            return r.left >= bounds.left && r.right <= bounds.right;
          });
        });
      if (!contained) throw Error("INPUT_OUTSIDE_FRAME_" + width + "_" + step);
      await page.screenshot({
        path: "var/landing-motion/input-" + step + ".png",
      });
      if (step < 2) await page.getByRole("button", { name: "다음 →" }).click();
    }
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await page.getByRole("button", { name: "이전", exact: true }).click();
    if ((await page.getByLabel("어떻게 불러드릴까요?").inputValue()) !== "가온")
      throw Error("LOST_BIRTH_INPUT");
  }
  const nativePage = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  await nativePage.goto("http://127.0.0.1:3200/");
  await nativePage.locator(".landing-more > summary").click();
  await nativePage.locator(".book-price").waitFor({ state: "visible" });
  console.log(
    JSON.stringify({
      oneScreen: true,
      widths: [390, 375, 320, 1440],
      pauseControlRemoved: true,
      reducedMotion: true,
      nativeDetails: true,
      javascriptDisabled: true,
    }),
  );
} finally {
  await browser?.close();
  server.kill();
}
