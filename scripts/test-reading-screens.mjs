import { spawn } from "node:child_process";
import { chromium } from "playwright";
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
              .getByRole("link", { name: "종합 운명서 구매 살펴보기" })
              .isVisible())
          )
            throw Error("PURCHASE_MUST_BE_LAST");
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
