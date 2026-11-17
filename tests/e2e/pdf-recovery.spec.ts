import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const html = readFileSync("public/merchant-review/index.html", "utf8");
const report = JSON.parse(
  html.match(
    /<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1],
).report;

test("PDF timeout releases the button and a manual retry downloads without another purchase", async ({
  page,
}) => {
  let stalled = true,
    requests = 0,
    mutations = 0;
  await page.route("**/api/reports/synthetic-pdf", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-pdf/pdf", (route) => {
    requests++;
    if (stalled) return;
    return route.fulfill({
      contentType: "application/pdf",
      body: "%PDF-1.4\nsynthetic\n%%EOF",
    });
  });
  await page.route("**/api/orders", (route) => {
    mutations++;
    return route.fulfill({
      status: 500,
      json: { error: "unexpected mutation" },
    });
  });
  await page.goto("/report/synthetic-pdf");
  await expect(
    page.getByRole("button", { name: "PDF 다운로드", exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(20001);
  await expect(
    page.getByRole("alert").filter({ hasText: "PDF를 가져오지 못했습니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "PDF 다운로드", exact: true }),
  ).toBeEnabled();
  stalled = false;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("geumseo-report.pdf");
  expect(requests).toBe(2);
  expect(mutations).toBe(0);
});

test("an HTML response does not download or retain the previous success notice", async ({
  page,
}) => {
  let invalid = false,
    downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/reports/synthetic-pdf", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-pdf/pdf", (route) =>
    route.fulfill({
      contentType: invalid ? "text/html" : "application/pdf",
      body: invalid
        ? "<html>synthetic upstream failure</html>"
        : "%PDF-1.4\nsynthetic\n%%EOF",
    }),
  );
  await page.goto("/report/synthetic-pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await download;
  await expect(
    page.getByRole("status").filter({ hasText: "다운로드를 요청했습니다" }),
  ).toBeVisible();
  invalid = true;
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "PDF를 가져오지 못했습니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "다운로드를 요청했습니다" }),
  ).toHaveCount(0);
  expect(downloads).toBe(1);
});
