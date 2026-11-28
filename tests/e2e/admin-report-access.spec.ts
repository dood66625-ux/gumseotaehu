import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync("public/merchant-review/index.html", "utf8").match(
    /<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1],
).report;
const oid = "00000000-0000-4000-8000-000000000041";
test("visible report sends one nonblocking display signal and overview navigation does not duplicate it", async ({
  page,
}) => {
  const data = structuredClone(fixture);
  let writes = 0;
  await page.route(`**/api/reports/${oid}`, (r) => r.fulfill({ json: data }));
  await page.route(`**/api/reports/${oid}/counsel`, (r) =>
    r.fulfill({ json: { entries: [], remaining: 3, total: 3 } }),
  );
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route(`**/api/reports/${oid}/view-status`, (r) => {
    const body = r.request().postDataJSON();
    expect(body.state).toBe("viewed");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    writes++;
    return r.fulfill({ status: 503, json: { error: "temporary" } });
  });
  await page.goto("/report/" + oid);
  await expect(page.locator(".immersive-scene-text")).toBeVisible();
  await expect.poll(() => writes).toBe(1);
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  await expect(page.locator(".report-overview")).toBeVisible();
  expect(writes).toBe(1);
  await expect(
    page.getByRole("alert").filter({ hasText: "temporary" }),
  ).toHaveCount(0);
});
test("admin order rows distinguish display confirmation, historic response, generation error and refunded access", async ({
  page,
}) => {
  const access = {
    viewCount: 2,
    firstViewedAt: 1800000000000,
    lastViewedAt: 1800000001000,
    errorCount: 0,
    blockedCount: 0,
    lastIssue: null,
    availability: "열람 가능",
    generationIssue: null,
    legacyResponseAt: null,
  };
  const order = {
    id: "shown-order",
    email: "masked…",
    amount: 22000,
    payment: "paid",
    fulfillment: "ready",
    livePayment: true,
    expires: Date.now() + 86400000,
    access,
  };
  await page.route("**/api/admin?*", (r) =>
    r.fulfill({
      json: {
        orders: [
          order,
          {
            ...order,
            id: "old-order",
            access: {
              ...access,
              viewCount: 0,
              legacyResponseAt: 1800000000000,
              availability: "작성 실패 · 열람 불가",
              generationIssue: { code: "AI_TIMEOUT", attempts: 4 },
            },
          },
          {
            ...order,
            id: "refund-order",
            payment: "refunded",
            access: { ...access, availability: "환불 완료 · 열람 종료" },
          },
        ],
        metrics: { gross: 66000, refunds: 22000 },
        tickets: [],
        jobs: [],
        refunds: [],
        audit: [],
        events: [],
        mailDeliveries: [],
        mailCount: 0,
      },
    }),
  );
  await page.goto("/admin");
  const shown = page.getByRole("row").filter({ hasText: "shown-order" });
  await expect(shown).toContainText("화면 열람 확인");
  await expect(shown).toContainText("최근 30일 2회");
  const old = page.getByRole("row").filter({ hasText: "old-order" });
  await expect(old).toContainText("화면 열람 미확인");
  await expect(old).toContainText("과거 자료 응답 기록만 있음");
  await expect(old).toContainText("작성 실패");
  await expect(old).toContainText("AI_TIMEOUT");
  await expect(
    page.getByRole("row").filter({ hasText: "refund-order" }),
  ).toContainText("환불 완료 · 열람 종료");
});
