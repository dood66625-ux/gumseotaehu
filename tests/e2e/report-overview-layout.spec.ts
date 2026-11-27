import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const report = JSON.parse(
  readFileSync("public/merchant-review/index.html", "utf8").match(
    /<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1],
).report;
test("overview has one focus heading, centered chapter navigation and a single footer for actions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  await page.route("**/api/reports/synthetic-overview", (r) =>
    r.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-overview/counsel", (r) =>
    r.fulfill({ json: { entries: [], remaining: 3, total: 3 } }),
  );
  await page.goto("/report/synthetic-overview");
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  const overview = page.locator(".report-overview");
  await expect(
    overview.getByRole("heading", {
      name: "지금, 무엇이 궁금하느냐?",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(overview.locator(".report-focus")).toHaveCount(1);
  await expect(overview.locator(".type-share-copy")).toHaveCount(0);
  await expect(overview.getByText(/나는 금서태후에서/)).toHaveCount(0);
  await expect(overview.getByText(/인물의 실제 사주 일치도/)).toHaveCount(0);
  await expect(
    overview.getByText("그대의 운명서, 한눈에 펼쳐 보거라.", { exact: true }),
  ).toHaveCount(0);
  await expect(overview.getByText(/YOUR SEALED ARCHIVE/)).toHaveCount(0);
  await expect(
    overview.getByRole("link", { name: "내 운명서 다시 찾기", exact: true }),
  ).toHaveCount(0);
  const placement = await overview.evaluate((n) => {
    const report = n.querySelector(".report-reader")!.getBoundingClientRect(),
      toolbar = n
        .querySelector(".report-bottom-actions")!
        .getBoundingClientRect(),
      info = n.querySelector(".report-disclosure")!.getBoundingClientRect(),
      nav = n.querySelector(".report-nav")!.getBoundingClientRect();
    return {
      bottom: toolbar.top >= report.bottom - 1,
      infoLast: info.top >= toolbar.bottom - 1,
      center:
        Math.abs(
          toolbar.left + toolbar.width / 2 - (report.left + report.width / 2),
        ) < 1,
      navCenter:
        Math.abs(nav.left + nav.width / 2 - (report.left + report.width / 2)) <
        1,
      labels: [...n.querySelectorAll(".report-nav a")].every(
        (a) => getComputedStyle(a).textAlign === "center",
      ),
    };
  });
  expect(placement).toEqual({
    bottom: true,
    infoLast: true,
    center: true,
    navCenter: true,
    labels: true,
  });
  const toolbar = overview.locator(".report-bottom-actions");
  for (const name of [
    "장별로 다시 읽기",
    "태후에게 자문하기",
    "PDF 저장",
    "메일로 보내기",
  ])
    await expect(
      toolbar.getByRole("button", { name, exact: true }),
    ).toHaveCount(1);
  await expect(overview.locator(".report-disclosure")).not.toHaveAttribute(
    "open",
  );
});
