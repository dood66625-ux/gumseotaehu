import { test, expect } from "@playwright/test";
test("visitor duplicate groups are collapsed and paginate fifteen at a time", async ({
  page,
}) => {
  const now = Date.now();
  await page.route("**/api/admin/visitors?*", async (route) => {
    const second = route.request().url().endsWith("page=1");
    await route.fulfill({
      json: {
        total: 16,
        summary: {
          todayVisitors: 21,
          todaySessions: 28,
          todayCheckout: 3,
          topSource: "search.naver.com",
          todayPurchases: 1,
        },
        visits: second
          ? []
          : Array.from({ length: 15 }, (_, i) => ({
              id: "synthetic-" + i,
              first_seen: now,
              last_seen: now,
              source: "direct",
              entry_stage: "landing",
              last_stage: "birth",
              events: [],
              orders: [],
              sessionCount: i === 0 ? 2 : 1,
              sessions: [
                {
                  id: "first",
                  first_seen: now,
                  last_seen: now,
                  last_stage: "birth",
                  events: [],
                },
                {
                  id: "second",
                  first_seen: now,
                  last_seen: now,
                  last_stage: "landing",
                  events: [],
                },
              ],
            })),
      },
    });
  });
  await page.goto("/admin/visitors");
  await expect(
    page.locator(".visitor-admin-toolbar").getByText("페이지당 15건"),
  ).toBeVisible();
  await expect(page.locator(".visitor-admin-metrics article")).toHaveCount(4);
  await expect(
    page.locator(".visitor-admin-metrics").getByText("search.naver.com"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const summary = page.getByText("중복 접속 2건 펼치기");
  await expect(summary).toBeVisible();
  await expect(summary.locator("..")).not.toHaveAttribute("open", "");
  await summary.click();
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("이 기간에 수집된 방문 기록이 없습니다."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이전", exact: true }),
  ).toBeEnabled();
});

test("password-only operator can choose a new password and log in again", async ({
  page,
}) => {
  const { config } = await import("../../lib/config");
  config();
  await page.goto("/admin");
  await expect(page.locator("#admin-code")).toHaveCount(0);
  await page.locator("#admin-password").fill(process.env.ADMIN_PASSWORD!);
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await page.getByText("관리자 비밀번호 변경", { exact: true }).click();
  await page
    .getByLabel("현재 비밀번호", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page
    .getByLabel("새 비밀번호 (12~200자)", { exact: true })
    .fill("synthetic-chosen-password-123");
  await page
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill("synthetic-chosen-password-123");
  await page.getByRole("button", { name: "변경 후 다시 로그인" }).click();
  await expect(page.locator("#admin-password")).toBeVisible();
  await page.locator("#admin-password").fill("synthetic-chosen-password-123");
  await page
    .getByRole("button", { name: "관리자 로그인", exact: true })
    .click();
  await expect(
    page.getByText("관리자 비밀번호 변경", { exact: true }),
  ).toBeVisible();
  const restored = await page.request.post("/api/admin/password", {
    headers: { origin: "http://localhost:3000" },
    data: {
      currentPassword: "synthetic-chosen-password-123",
      password: process.env.ADMIN_PASSWORD,
    },
  });
  expect(restored.status()).toBe(200);
});

test("expired visitor authentication offers password reentry and restores the log without refreshing", async ({
  page,
}) => {
  let signedIn = false;
  await page.route("**/api/admin/visitors?*", (route) =>
    signedIn
      ? route.fulfill({
          json: {
            total: 0,
            visits: [],
            summary: {
              todayVisitors: 0,
              todaySessions: 0,
              todayCheckout: 0,
              topSource: null,
              todayPurchases: 0,
            },
          },
        })
      : route.fulfill({
          status: 401,
          json: { error: "중요 작업 전 관리자 로그인을 다시 해주세요." },
        }),
  );
  await page.route("**/api/admin/login", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      password: "synthetic-reauth-password",
    });
    signedIn = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/visitors");
  await expect(
    page.getByLabel("관리자 비밀번호", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("관리자 비밀번호", { exact: true })
    .fill("synthetic-reauth-password");
  await page.getByRole("button", { name: "다시 로그인하고 로그 보기" }).click();
  await expect(
    page.getByText("이 기간에 수집된 방문 기록이 없습니다."),
  ).toBeVisible();
  await expect(page.locator(".visitor-admin-login")).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/visitors$/);
});
