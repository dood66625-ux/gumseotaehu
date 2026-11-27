import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const report = JSON.parse(
  readFileSync("public/merchant-review/index.html", "utf8").match(
    /<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1],
).report;
test("minimal counsel form keeps three durable replies in a tabbed dialog without duplicate writes", async ({
  page,
}) => {
  if (test.info().project.name.startsWith("mobile"))
    await page.setViewportSize({ width: 320, height: 568 });
  const entries: any[] = [];
  let writes = 0,
    finish = false;
  const view = () => ({ entries, remaining: 3 - entries.length, total: 3 });
  await page.route("**/api/reports/synthetic-counsel", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-counsel/counsel", (route) => {
    if (route.request().method() === "POST") {
      writes++;
      const { question } = route.request().postDataJSON();
      entries.push({
        id: "synthetic-" + writes,
        number: writes,
        question,
        answer: writes === 3 ? "세번째 답문이니라." : null,
        state: writes === 3 ? "ready" : "queued",
        created: Date.now(),
      });
    } else if (finish) {
      for (const e of entries)
        if (!e.answer) {
          e.answer =
            e.number === 1 ? "첫번째 답문이니라." : "두번째 답문이니라.";
          e.state = "ready";
        }
    }
    return route.fulfill({ json: view() });
  });
  await page.goto("/report/synthetic-counsel");
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  await page
    .getByRole("button", { name: "태후에게 자문하기", exact: true })
    .click();
  const title = page.locator("#counsel-title"),
    input = page.getByLabel("태후에게 올릴 물음"),
    submit = page.getByRole("button", { name: "자문 구하기", exact: true }),
    dialog = page.getByRole("dialog", { name: "태후의 자문" });
  await expect(title).toHaveText("태후에게 세번의 자문을 구하거라 (3/3)");
  await expect(
    page.getByText("PDF는 전체 보기에서", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".taehou-counsel .hint")).toHaveCount(0);
  const a = await input.boundingBox(),
    b = await submit.boundingBox();
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
  const fullyVisible = await submit.evaluate(
    (n) =>
      n.getBoundingClientRect().bottom <=
      document.querySelector(".immersive-scene-text")!.getBoundingClientRect()
        .bottom +
        1,
  );
  expect(fullyVisible).toBe(true);
  await page.screenshot({ path: test.info().outputPath("counsel-form.png") });
  await input.fill("첫 물음");
  await submit.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("답문을 적고");
  await expect(title).toHaveText("태후에게 세번의 자문을 구하거라 (2/3)");
  await expect(dialog.getByRole("tab", { name: "두번째 자문" })).toBeDisabled();
  await dialog
    .getByRole("button", { name: "감사합니다.", exact: true })
    .click();
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  finish = true;
  await page.waitForTimeout(3300);
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "태후에게 자문하기", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("첫번째 답문이니라.");
  await dialog
    .getByRole("button", { name: "감사합니다.", exact: true })
    .click();
  finish = false;
  await input.fill("두번째 물음");
  await submit.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "첫번째 자문" }).click();
  await expect(dialog).toContainText("첫번째 답문이니라.");
  finish = true;
  await page.waitForTimeout(3300);
  await expect(
    dialog.getByRole("tab", { name: "첫번째 자문" }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "두번째 자문" }).click();
  await expect(dialog).toContainText("두번째 답문이니라.");
  await dialog
    .getByRole("button", { name: "감사합니다.", exact: true })
    .click();
  await input.fill("세번째 물음");
  await submit.click();
  await expect(dialog).toContainText("세번째 답문이니라.");
  await expect(title).toHaveText("태후에게 세번의 자문을 구하거라 (0/3)");
  for (const name of ["첫번째 자문", "두번째 자문", "세번째 자문"])
    await expect(dialog.getByRole("tab", { name })).toBeEnabled();
  const fits = await dialog.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return (
      r.top >= 0 &&
      r.bottom <= innerHeight + 1 &&
      r.left >= 0 &&
      r.right <= innerWidth + 1
    );
  });
  expect(fits).toBe(true);
  await page.screenshot({ path: test.info().outputPath("counsel-popup.png") });
  await dialog
    .getByRole("button", { name: "감사합니다.", exact: true })
    .click();
  await expect(page.locator(".report-chapter:visible")).toHaveCount(9);
  await page
    .getByRole("button", { name: "태후에게 자문하기", exact: true })
    .click();
  await expect(input).toBeDisabled();
  await page
    .getByRole("button", { name: "이전 자문 보기", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "첫번째 자문" }).click();
  await expect(dialog).toContainText("첫번째 답문이니라.");
  expect(writes).toBe(3);
});
