import { expect, test } from "@playwright/test";
import { business } from "../../lib/business";
test("legacy help links open the email refund policy without requiring login", async ({
  page,
}) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/legal\/refund$/);
  await expect(page.locator(".support-email").first()).toHaveText(
    business.email,
  );
  await expect(page.locator(".page.legal a[href^=mailto]")).toHaveCount(0);
  await expect(page.locator('.footer-links a[href="/admin"]')).toHaveCount(0);
  await expect(page.getByLabel("문의 내용")).toHaveCount(0);
  await expect(
    page
      .locator(".footer-links")
      .getByRole("link", { name: "환불 정책", exact: true }),
  ).toBeVisible();
});
test("email intake remains available when the former support API is unavailable", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/tickets", (r) => {
    reads++;
    return r.fulfill({ status: 503, json: { error: "offline" } });
  });
  await page.goto("/legal/refund");
  await expect(page.locator(".support-email").first()).toBeVisible();
  expect(reads).toBe(0);
  await expect(page.getByText("3영업일", { exact: false })).toBeVisible();
});
test("email instructions include order lookup fields and a copyable address without submitting data", async ({
  page,
}) => {
  let submissions = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/tickets"))
      submissions++;
  });
  await page.goto("/legal/refund");
  await expect(page.locator(".support-email").first()).toHaveText(
    business.email,
  );
  await expect(
    page.getByText("구매 이메일, 주문번호 또는 결제일", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "이메일로 접수하기", exact: true }),
  ).toHaveCount(0);
  expect(submissions).toBe(0);
});
