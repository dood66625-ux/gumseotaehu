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
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
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
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
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

test("leaving the reader aborts its pending PDF and never downloads on the recovery page", async ({
  page,
}) => {
  let pending: import("@playwright/test").Route | undefined,
    downloads = 0,
    aborted = 0;
  page.on("download", () => downloads++);
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/synthetic-pdf/pdf")) aborted++;
  });
  await page.route("**/api/reports/synthetic-pdf", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-pdf/pdf", (route) => {
    pending = route;
  });
  await page.route("**/api/orders", (route) => route.fulfill({ json: [] }));
  await page.goto("/report/synthetic-pdf");
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  await page.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page
    .getByRole("link", { name: "내 운명서 다시 찾기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/recover$/);
  await expect(
    page.getByText("이 이메일의 구매 내역이 없습니다.", { exact: false }),
  ).toBeVisible();
  await expect.poll(() => aborted).toBe(1);
  await pending!
    .fulfill({
      contentType: "application/pdf",
      body: "%PDF-1.4\nlate synthetic\n%%EOF",
    })
    .catch(() => {});
  // The scoped request is already confirmed aborted; unrelated image/prefetch traffic may stay active.
  await page.waitForTimeout(250);
  expect(downloads).toBe(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "PDF를 가져오지 못했습니다" }),
  ).toHaveCount(0);
});
