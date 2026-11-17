import { expect, test } from "@playwright/test";

test("support outage is retryable without treating failure as authentication loss or empty history", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/orders", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/tickets", (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { error: "synthetic temporary outage" },
        })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/help");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "주문·문의 내역을 불러오지 못했습니다" }),
  ).toContainText("주문·문의 내역을 불러오지 못했습니다");
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("아직 접수한 문의가 없습니다.", { exact: true }),
  ).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "주문·문의 내역 다시 확인" }).click();
  await expect(page.getByLabel("문의 내용")).toBeVisible();
  await expect(
    page.getByText("아직 접수한 문의가 없습니다.", { exact: true }),
  ).toBeVisible();
});

test("successful support receipt survives a list refresh outage and retry performs no second submission", async ({
  page,
}) => {
  let unavailable = false,
    submissions = 0;
  const ticket = {
    id: "synthetic-receipt-001",
    status: "open",
    category: "refund",
    due: Date.now() + 86400000,
    message: "가상 환불 요청 검증",
  };
  await page.route("**/api/orders", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/tickets", (route) => {
    if (route.request().method() === "POST") {
      submissions++;
      unavailable = true;
      return route.fulfill({ json: { id: ticket.id } });
    }
    return unavailable
      ? route.fulfill({
          status: 503,
          json: { error: "synthetic temporary outage" },
        })
      : route.fulfill({ json: submissions ? [ticket] : [] });
  });
  await page.goto("/help");
  await page.getByLabel("문의 내용").fill(ticket.message);
  await page
    .getByRole("button", { name: "문의 접수하기", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "접수되었습니다" }),
  ).toContainText(ticket.id);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "주문·문의 내역을 불러오지 못했습니다" }),
  ).toContainText("다시 접수하지 말고");
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "주문·문의 내역 다시 확인" }).click();
  await expect(page.getByRole("article")).toContainText(ticket.message);
  await expect(
    page.getByRole("status").filter({ hasText: "접수되었습니다" }),
  ).toContainText(ticket.id);
  expect(submissions).toBe(1);
});

test("support session expiration requests fresh authentication instead of showing stale records", async ({
  page,
}) => {
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "synthetic session expired" },
    }),
  );
  await page.route("**/api/tickets", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "synthetic session expired" },
    }),
  );
  await page.goto("/help");
  await expect(page.getByLabel("이메일 주소", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "주문·문의 내역 다시 확인" }),
  ).toHaveCount(0);
});
