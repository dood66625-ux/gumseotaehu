/** Synthetic static UI only: no customer data, API credentials, or generation. */
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";
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
  browser = await (process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium).launch();
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
    if (await page.locator("#mobile-prologue[open]").count())
      await page
        .getByRole("button", { name: "이야기 건너뛰고 메인으로" })
        .click();
    await page.locator("#mobile-prologue").waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "내 사주 펼쳐보기" }).waitFor();
    const logo = await page.locator(".header .brand-logo").evaluate((n) => {
      const bounds = n.getBoundingClientRect();
      const menu = document
        .querySelector(".header nav")
        .getBoundingClientRect();
      return {
        loaded: n.complete && n.naturalWidth > 0,
        overlaps: bounds.right > menu.left,
        height: bounds.height,
      };
    });
    if (!logo.loaded || logo.overlaps || logo.height > 77)
      throw Error("BRAND_LOGO_LOAD_OR_ALIGNMENT");
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
    const primary = await page.locator(".hero-cta").boundingBox();
    const review = await page
      .getByRole("link", { name: "토스 테스트 결제" })
      .boundingBox();
    if (
      !primary ||
      !review ||
      Math.abs(primary.width - review.width) > 1 ||
      review.y < primary.y + primary.height ||
      review.y + review.height > height
    )
      throw Error("REVIEW_CTA_ALIGNMENT_" + width);
    const scale = await page.locator(".hero-portrait picture").evaluate((n) => {
      const value = getComputedStyle(n).transform;
      return value === "none" ? 1 : new DOMMatrix(value).a;
    });
    if (scale !== 1) throw Error("PORTRAIT_FRAME_SHRUNK");
    const portrait = await page
      .locator(".hero-portrait img")
      .evaluate((img) => ({
        source: img.currentSrc,
        loaded: img.complete && img.naturalWidth > 0,
        position: getComputedStyle(img).objectPosition,
        fit: getComputedStyle(img).objectFit,
        pixels: img.naturalWidth,
      }));
    if (!portrait.loaded) throw Error("PORTRAIT_NOT_LOADED");
    if(width <= 900 && (portrait.fit !== "contain" || portrait.pixels < 1200)) throw Error("MOBILE_PORTRAIT_CROP_OR_LOW_RES");
    await page.locator("#prologue-replay").focus();
    if(await page.locator("#prologue-replay").evaluate(n=>getComputedStyle(n).outlineStyle !== "none")) throw Error("REPLAY_RECTANGULAR_RING");
    if (
      width >= 901 &&
      !portrait.source.endsWith("/empress-royal-distant.webp")
    )
      throw Error("DISTANT_DESKTOP_PORTRAIT_MISSING");
    if (width >= 901 && portrait.position !== "50% 30%")
      throw Error("DESKTOP_PORTRAIT_NOT_RAISED");
    if (width >= 901) {
      const framing = await page
        .locator(".hero-portrait picture")
        .evaluate((n) => {
          const css = getComputedStyle(n);
          return {
            x: new DOMMatrix(css.transform).e,
            width: n.getBoundingClientRect().width,
            fade: css.maskImage,
          };
        });
      if (
        Math.abs(framing.x + framing.width * 0.15) > 1 ||
        framing.fade === "none"
      )
        throw Error("PORTRAIT_LEFT_SHIFT_OR_FADE_MISSING");
    }
    if (width < 901 && portrait.source.endsWith("/empress-royal-distant.webp"))
      throw Error("MOBILE_PORTRAIT_CHANGED");

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
    for (let step = 0; step < 5; step++) {
      await page.waitForTimeout(250);
      await page.evaluate(() => scrollTo(0, 0));
      const portraitFits = await page.locator(".birth-portrait").evaluate((frame) => {
        const f = frame.getBoundingClientRect();
        const p = frame.querySelector(".empress-expression").getBoundingClientRect();
        const q = document.querySelector(".birth-conversation").getBoundingClientRect();
        return p.top >= f.top - 1 && Math.abs(p.width - Math.min(innerWidth,560)) < 1
          && f.height >= p.height * .81 && q.top >= f.bottom - 1;
      });
      if (!portraitFits) throw Error("BIRTH_PORTRAIT_SCALE_OR_FORM_OVERLAP_" + width + "_" + step);
      await page.locator(".birth-step-actions").scrollIntoViewIfNeeded();
      if (!(await page.getByRole("button", {name:step === 4 ? "무료 사주풀이 펼치기 ↗" : "다음 →"}).isVisible()))
        throw Error("BIRTH_ACTION_UNREACHABLE");
      await page.evaluate(() => scrollTo(0,0));
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
        path: "var/landing-motion/input-" + width + "-" + step + ".png",
      });
      if (step < 4) await page.getByRole("button", { name: "다음 →" }).click();
    }
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await page.getByRole("button", { name: "이전", exact: true }).click();
    if ((await page.getByLabel("이름 또는 별명").inputValue()) !== "가온")
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
      landingOneScreen: true,
      inputPortraitOriginalSize: true,
      inputMayScrollOnShortScreens: true,
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
