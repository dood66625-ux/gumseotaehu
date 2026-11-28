import { expect, test } from "@playwright/test";
test("normal and sale prices are clear without changing the order amount", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const headers = { origin: baseURL! };
  await page.request.post("/api/session", { headers, data: {} });
  const response = await page.request.post("/api/readings", {
    headers,
    data: {
      name: "할인검증",
      date: "1995-05-15",
      calendar: "solar",
      leap: false,
      time: "10:30",
      sex: "female",
      place: "KR",
      self: true,
      consent: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  await page.goto("/reading/preview?id=" + id);
  const purchase = page.getByRole("link", {
    name: "22,000원 할인 결제하기",
    exact: true,
  });
  for (let n = 0; n < 10 && !(await purchase.isVisible()); n++)
    await page.locator(".screen-flow-controls button").last().click();
  await expect(purchase).toBeVisible();
  await expect(purchase.locator("del")).toHaveText("44,000원");
  await expect(purchase.locator("span span")).toHaveText(
    "22,000원 할인 결제하기",
  );
  const rect = await purchase.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  expect(
    await purchase
      .locator("del")
      .evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toContain("line-through");
  await purchase.screenshot({
    path: "var/sale-price-button-" + test.info().project.name + ".png",
  });
  await purchase.click();
  await expect(page.locator(".checkout-product .price")).toHaveText("22,000원");
  await expect(page.locator(".checkout-product del")).toHaveCount(0);
});
