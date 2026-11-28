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
      if (screen === "checkout") {
        if (await page.getByRole("button", { name: "다음 →" }).count())
          throw Error("CHECKOUT_STEPS_REMAIN");
        const heading = await page.locator(".checkout-flow > h1").boundingBox();
        const eyebrow = await page.locator(".checkout-eyebrow").boundingBox();
        if (!heading || !eyebrow || eyebrow.y + eyebrow.height > heading.y)
          throw Error("OVERLAPPING_HEADINGS");
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          throw Error("CHECKOUT_WIDTH");
        continue;
      }
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
          const arrow = await page
            .locator(".screen-flow-controls button")
            .last()
            .evaluate((n) => {
              const r = n.getBoundingClientRect(),
                s = getComputedStyle(n);
              return {
                center: r.top + r.height / 2,
                border: s.borderTopWidth,
                background: s.backgroundColor,
                height: innerHeight,
              };
            });
          if (
            Math.abs(arrow.center - arrow.height * 0.5) > 1 ||
            arrow.border !== "0px" ||
            arrow.background !== "rgba(0, 0, 0, 0)"
          )
            throw Error("ARROW_PRESENTATION");
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
              .getByRole("link", { name: "22,000원 할인 결제하기" })
              .isVisible())
          )
            throw Error("PURCHASE_MUST_BE_LAST");
          if (screen === "preview") {
            await page
              .getByRole("button", { name: "운명서 구성 살펴보기" })
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
            const invitation = await page
              .locator(".preview-invitation")
              .boundingBox();
            const purchase = await page
              .getByRole("link", { name: "22,000원 할인 결제하기" })
              .boundingBox();
            if (
              !invitation ||
              !purchase ||
              invitation.y + invitation.height > purchase.y
            )
              throw Error("INVITATION_BEFORE_PURCHASE");
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
