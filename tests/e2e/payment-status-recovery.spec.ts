import { expect, test } from "@playwright/test";

test("slow order lookup never overlaps polling and refresh recovers without another payment", async ({
  page,
}) => {
  let calls = 0;
  let finish: () => void = () => {};
  const slow = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.clock.install();
  await page.route("**/api/orders/synthetic-slow-order", async (route) => {
    calls++;
    if (calls === 1) await slow;
    await route.fulfill({
      json: {
        id: "synthetic-slow-order",
        payment: "paid",
        fulfillment: calls === 1 ? "working" : "ready",
        deleted: false,
        expires: Date.now() + 86400000,
      },
    });
  });
  await page.goto("/checkout/success?orderId=synthetic-slow-order");
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(10000);
  expect(calls).toBe(1);
  finish();
  await expect(
    page.getByRole("heading", { name: "운명서 펼치는 중…" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("npm run worker");
  await page.clock.fastForward(2100);
  await expect(
    page.getByRole("link", { name: "운명서 전체 읽기" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "운명서가 펼쳐졌느니라." }),
  ).toBeVisible();
  await page.clock.fastForward(10000);
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "잠시 후에 보겠노라" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "운명서 펼치기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
