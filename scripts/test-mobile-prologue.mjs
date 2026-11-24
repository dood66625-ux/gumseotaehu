/** Synthetic local assets only; no customer inputs, payment or generation calls. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, webkit } from "playwright";
const server = spawn(process.execPath, ["scripts/serve-public-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_BASE_PATH: "",
    PREVIEW_OUTPUT: "public/merchant-review",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const origin = "http://127.0.0.1:3200/";
try {
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
  });
  const engine = process.env.STORY_BROWSER === "webkit" ? webkit : chromium;
  browser = await engine.launch();
  mkdirSync("var/mobile-prologue", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(
    () => document.getElementById("mobile-prologue")?.dataset.scene === "1",
  );
  await page.waitForTimeout(500);
  if (
    (await page
      .locator('.prologue-scene[data-scene="1"] figcaption')
      .evaluate((n) => getComputedStyle(n).animationDelay)) !== "0.9s"
  )
    throw Error("CAPTION_DELAY_NOT_UPDATED");
  if (
    (await page
      .locator("#prologue-skip")
      .evaluate((n) => getComputedStyle(n).outlineStyle)) !== "none"
  )
    throw Error("SKIP_AUTOMATIC_OUTLINE");
  if (
    Number(
      await page
        .locator('.prologue-scene[data-scene="1"] figcaption')
        .evaluate((n) => getComputedStyle(n).opacity),
    ) !== 0
  )
    throw Error("CAPTION_DID_NOT_WAIT_FOR_IMAGE");
  await page.waitForTimeout(1450);
  let previous = performance.now();
  for (let i = 1; i <= 5; i++) {
    if (i > 1) {
      await page.waitForFunction(
        (i) =>
          document.getElementById("mobile-prologue")?.dataset.scene ===
          String(i),
        i,
        { timeout: 7000 },
      );
      const elapsed = performance.now() - previous;
      if (i > 2 && (elapsed < 3700 || elapsed > 4800))
        throw Error("SCENE_READING_TIME_" + elapsed);
      previous = performance.now();
      await page.waitForTimeout(2200);
    }
    const scene = page.locator('.prologue-scene[data-scene="' + i + '"]');
    if ((await page.locator(".prologue-scene:visible").count()) !== 1)
      throw Error("SCENES_OVERLAP");
    if (
      !(await scene
        .locator("img")
        .evaluate((n) => n.complete && n.naturalWidth === 800))
    )
      throw Error("SCENE_IMAGE_NOT_READY");
    if (
      Number(
        await scene
          .locator("figcaption")
          .evaluate((n) => getComputedStyle(n).opacity),
      ) < 0.95
    )
      throw Error("CAPTION_NOT_READABLE");
    await page.screenshot({
      path: "var/mobile-prologue/scene-" + i + "-" + engine.name() + ".png",
    });
  }
  await page
    .locator("#mobile-prologue.is-completing")
    .waitFor({ timeout: 7000 });
  if (
    (await page
      .locator("#mobile-prologue")
      .evaluate((n) => getComputedStyle(n).animationDuration)) !== "0.65s"
  )
    throw Error("DISSOLVE_TRANSITION_DURATION");
  await page
    .locator("#mobile-prologue")
    .waitFor({ state: "hidden", timeout: 2000 });
  await page
    .getByRole("link", { name: "내 사주 펼쳐보기", exact: true })
    .waitFor();
  await page.reload();
  if (await page.locator("#mobile-prologue[open]").count())
    throw Error("SESSION_INTRO_REPLAYED");
  const replay = page.getByRole("button", {
    name: "스토리 다시 보기",
    exact: true,
  });
  for (let round = 0; round < 2; round++) {
    await replay.click();
    await page.waitForFunction(
      () => document.getElementById("mobile-prologue")?.dataset.scene === "1",
    );
    if (
      Number(
        await page
          .locator('.prologue-scene[data-scene="1"] figcaption')
          .evaluate((n) => getComputedStyle(n).opacity),
      ) > 0.1
    )
      throw Error("REPLAY_CAPTION_DID_NOT_RESET");
    await page
      .getByRole("button", { name: "이야기 건너뛰고 메인으로" })
      .click();
    await page.locator("#mobile-prologue").waitFor({ state: "hidden" });
    if (
      (await page.evaluate(() => document.activeElement.id)) !==
      "prologue-replay"
    )
      throw Error("REPLAY_FOCUS_NOT_RESTORED");
  }
  await page.close();
  for (const [width, height] of [
    [320, 568],
    [375, 667],
  ]) {
    const small = await browser.newPage({ viewport: { width, height } });
    await small.goto(origin);
    const skip = small.getByRole("button", {
      name: "이야기 건너뛰고 메인으로",
    });
    const box = await skip.boundingBox();
    if (!box || box.y + box.height > height || box.x + box.width > width)
      throw Error("SKIP_OUTSIDE_VIEWPORT");
    if ((await skip.evaluate((n) => getComputedStyle(n).borderWidth)) !== "0px")
      throw Error("SKIP_HAS_BORDER");
    await skip.click();
    await small.locator("#mobile-prologue").waitFor({ state: "hidden" });
    const replayBox = await small
      .getByRole("button", { name: "스토리 다시 보기", exact: true })
      .boundingBox();
    if (
      !replayBox ||
      replayBox.y < 0 ||
      replayBox.y + replayBox.height > height
    )
      throw Error("REPLAY_OUTSIDE_VIEWPORT");
    await small
      .getByRole("link", { name: "내 사주 펼쳐보기", exact: true })
      .click();
    await small.locator(".birth-wizard").waitFor();
    await small.close();
  }
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const assets = [];
  desktop.on("request", (r) => {
    if (r.url().includes("/story/")) assets.push(r.url());
  });
  await desktop.goto(origin);
  if (
    (await desktop.locator("#mobile-prologue[open]").count()) ||
    assets.length
  )
    throw Error("DESKTOP_STORY_ASSETS_LOADED");
  await desktop
    .getByRole("button", { name: "스토리 다시 보기", exact: true })
    .click();
  await desktop.waitForFunction(
    () => document.getElementById("mobile-prologue")?.dataset.scene === "1",
  );
  if (!(await desktop.locator("#mobile-prologue").isVisible()))
    throw Error("DESKTOP_MANUAL_STORY_NOT_VISIBLE");
  await desktop.keyboard.press("Escape");
  await desktop.locator("#mobile-prologue").waitFor({ state: "hidden" });
  await desktop.close();
  const failed = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await failed.route("**/story/**", (r) => r.abort());
  await failed.goto(origin);
  await failed
    .locator("#mobile-prologue")
    .waitFor({ state: "hidden", timeout: 5000 });
  await failed
    .getByRole("link", { name: "내 사주 펼쳐보기", exact: true })
    .click();
  await failed.locator(".birth-wizard").waitFor();
  await failed.close();
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await reduced.goto(origin);
  await reduced.waitForFunction(
    () => document.getElementById("mobile-prologue")?.dataset.scene === "1",
  );
  if (
    (await reduced
      .locator('.prologue-scene[data-scene="1"] img')
      .evaluate((n) => getComputedStyle(n).animationName)) !== "none"
  )
    throw Error("REDUCED_MOTION_IGNORED");
  await reduced.keyboard.press("Escape");
  await reduced.locator("#mobile-prologue").waitFor({ state: "hidden" });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      engine: engine.name(),
      scenes: 5,
      captionDelayMs: 900,
      sceneDurationMs: 4100,
      autoMain: true,
      skip: true,
      oncePerTabSession: true,
      manualReplay: true,
      desktopAssets: 0,
      failedImageFallback: true,
      reducedMotion: true,
    }),
  );
} finally {
  await browser?.close();
  server.kill();
}
