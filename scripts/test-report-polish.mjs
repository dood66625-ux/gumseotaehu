/** Synthetic browser checks: immersion, inline archive, fonts, recovery and private sharing. No provider calls. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, webkit } from "playwright";
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
    server.once("exit", (c) => reject(Error("PREVIEW_SERVER_EXIT_" + c)));
  });
  mkdirSync("var/report-polish-checks", { recursive: true });
  for (const [engine, kind] of [
    [chromium, "chromium"],
    [webkit, "webkit"],
  ]) {
    browser = await engine.launch();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [1440, 900],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        sessionStorage.setItem(
          "geumseo-synthetic-preview-v1",
          JSON.stringify({
            authenticated: true,
            paid: true,
            created: true,
            tickets: [],
          }),
        );
        Object.defineProperty(navigator, "share", {
          value: async (value) => {
            window.__sharedType = value;
          },
          configurable: true,
        });
      });
      await page.goto(
        "http://127.0.0.1:3200/?screen=report&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      const stage = page.locator(".immersive-report-stage"),
        panel = page.locator(".immersive-copy-panel");
      await stage.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(async () => ({
        regular: (
          await document.fonts.load("400 16px KoreanReading", "잘못을 삶 값 닭")
        ).length,
        bold: (
          await document.fonts.load("700 16px KoreanReading", "잘못을 삶 값 닭")
        ).length,
      }));
      if (!loaded.regular || !loaded.bold)
        throw Error("KOREAN_FONT_NOT_LOADED");
      if (
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight > innerHeight + 1 ||
            document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error("IMMERSIVE_OUTER_SCROLL");
      const box = await panel.boundingBox();
      if (box.height < height * 0.45 || box.height > height * 0.55)
        throw Error("HALF_PAGE_SPLIT");
      if (
        !(await stage
          .getByRole("link", { name: "내 운명서 찾기", exact: true })
          .isVisible())
      )
        throw Error("IMMERSIVE_RECOVERY_HIDDEN");
      await stage.getByRole("button", { name: "다음 장", exact: true }).click();
      if (!(await stage.locator(".type-art").isVisible()))
        throw Error("TYPE_IMAGE_MISSING");
      if (
        !(await page.evaluate(async () => {
          const im = new Image();
          im.src = "/report-types.webp";
          await im.decode();
          return im.naturalWidth > 0;
        }))
      )
        throw Error("TYPE_IMAGE_NOT_LOADED");
      await stage.getByRole("button", { name: "다음 장", exact: true }).click();
      const chapter = await page.locator("#scene-title").innerText();
      const scroller = page.locator(".immersive-scene-text");
      await scroller.evaluate((n) => (n.scrollTop = n.scrollHeight));
      if ((await scroller.evaluate((n) => n.scrollTop)) <= 0)
        throw Error("TEXT_BOX_NOT_SCROLLABLE");
      if ((await page.evaluate(() => scrollY)) !== 0)
        throw Error("TEXT_SCROLLED_OUTER_PAGE");
      await page
        .getByRole("button", { name: "위로 펼치기", exact: true })
        .click();
      await page.waitForTimeout(300);
      const up = await panel.boundingBox();
      if (up.y >= box.y || up.height < height * 0.75)
        throw Error("PANEL_DID_NOT_EXPAND_UPWARDS");
      await stage.getByRole("button", { name: "다음 장", exact: true }).click();
      if ((await panel.getAttribute("data-expanded")) !== "true")
        throw Error("EXPANSION_LOST_NEXT");
      await stage.getByRole("button", { name: "이전 장", exact: true }).click();
      if ((await panel.getAttribute("data-expanded")) !== "true")
        throw Error("EXPANSION_LOST_PREVIOUS");
      await page.getByRole("button", { name: "접기", exact: true }).click();
      if (await scroller.isVisible()) throw Error("PANEL_NOT_FOLDED");
      await page.getByRole("button", { name: "글 읽기", exact: true }).click();
      if (!(await scroller.isVisible())) throw Error("PANEL_NOT_REOPENED");
      await page.waitForTimeout(300);
      await stage.screenshot({
        path: `var/report-polish-checks/immersive-expanded-${kind}-${width}.png`,
      });
      await page.reload();
      await page
        .getByRole("heading", { name: chapter, exact: true })
        .first()
        .waitFor();
      await page.emulateMedia({ media: "print" });
      if (!(await page.locator(".report-chapter").first().isVisible()))
        throw Error("NATIVE_PRINT_LOST_ARCHIVE");
      await page.emulateMedia({ media: "screen" });
      let turns = 0;
      while (
        await page.getByRole("button", { name: "다음 장", exact: true }).count()
      ) {
        await page
          .getByRole("button", { name: "다음 장", exact: true })
          .click();
        if (++turns > 30) throw Error("PAGING_LOOP");
      }
      await page
        .getByRole("heading", { name: "태후에게 자문을 구해보세요 (3/3)" })
        .waitFor();
      await page.getByLabel("태후에게 올릴 물음").fill("가".repeat(70));
      if (
        (await page.getByLabel("태후에게 올릴 물음").inputValue()).length !== 50
      )
        throw Error("QUESTION_LENGTH");
      await page
        .getByRole("button", { name: "전체 운명서 펼치기", exact: true })
        .click();
      if ((await page.locator(".report-chapter:visible").count()) !== 9)
        throw Error("ARCHIVE_CHAPTERS_MISSING");
      if (
        await page
          .getByRole("button", { name: "자세히 보기", exact: true })
          .count()
      )
        throw Error("REMOVED_DETAIL_BUTTON_REMAINS");
      if (await page.locator("dialog").count())
        throw Error("OLD_READING_DIALOG_REMAINS");

      const recover = page.locator(".header .recover-link");
      if (!(await recover.isVisible())) throw Error("MOBILE_RECOVERY_HIDDEN");
      const recoveryBox = await recover.boundingBox();
      if (recoveryBox.x < 0 || recoveryBox.x + recoveryBox.width > width + 1)
        throw Error("RECOVERY_OUTSIDE_SCREEN");
      await page
        .getByRole("button", { name: "내 타입 친구에게 보여주기" })
        .click();
      const shared = await page.evaluate(() => window.__sharedType);
      if (
        shared?.url !== "https://gumseo.kr/?from=type-share" ||
        /생년|report\//.test(JSON.stringify(shared))
      )
        throw Error("PRIVATE_TYPE_SHARE");
      await page
        .getByRole("button", { name: "장별로 다시 읽기", exact: true })
        .click();
      await stage.waitFor();
      await page
        .getByRole("button", { name: "전체 운명서", exact: true })
        .click();
      await page
        .getByRole("button", { name: "태후에게 자문하기", exact: true })
        .click();
      if (
        (await page.getByLabel("태후에게 올릴 물음").inputValue()).length !== 50
      )
        throw Error("COUNSEL_DRAFT_LOST_WHEN_TURNING_PAGES");
      await page
        .getByRole("button", { name: "전체 운명서", exact: true })
        .click();
      await page
        .getByRole("button", { name: "장별로 다시 읽기", exact: true })
        .click();
      await stage.waitFor();
      await page.waitForTimeout(300);
      await stage.screenshot({
        path: `var/report-polish-checks/immersive-${kind}-${width}.png`,
      });
      if (errors.length) throw Error("BROWSER_ERROR_" + errors.join("|"));
      console.log(
        JSON.stringify({
          engine: kind,
          width,
          height,
          halfPortrait: true,
          innerScroll: true,
          upwardExpansion: true,
          fold: true,
          resume: true,
          finalArchive: true,
          recoveryVisible: true,
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
