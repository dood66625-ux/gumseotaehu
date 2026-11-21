import { expect, test } from "@playwright/test";
const oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("purchase receipt loads only on request and rejects an untrusted link on retry", async ({
  page,
}) => {
  let reads = 0,
    unsafe = false,
    writes = 0;
  const url =
    "https://dashboard.tosspayments.com/receipt/redirection?transactionId=synthetic&ref=PX";
  page.on("request", (req) => {
    if (req.url().includes("/api/") && req.method() === "POST") writes++;
  });
  await page.route("**/api/orders/" + oid, (route) =>
    route.fulfill({
      json: {
        id: oid,
        livePayment: true,
        payment: "refunded",
        fulfillment: "ready",
        deleted: false,
        expires: Date.now() + 86400000,
      },
    }),
  );
  await page.route("**/api/orders/" + oid + "/receipt", (route) => {
    reads++;
    return route.fulfill({
      json: { url: unsafe ? "https://evil.invalid/receipt" : url },
    });
  });
  await page.goto("/checkout/success?orderId=" + oid);
  const button = page.getByRole("button", {
    name: "토스 구매 증빙 확인",
    exact: true,
  });
  await expect(button).toBeVisible();
  expect(reads).toBe(0);
  await button.click();
  const link = page.getByRole("link", { name: "토스 구매 증빙 열기" });
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(reads).toBe(1);
  expect(writes).toBe(0);
  unsafe = true;
  await button.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "구매 증빙을 불러오지 못했습니다" }),
  ).toBeVisible();
  await expect(link).toHaveCount(0);
  expect(reads).toBe(2);
  expect(writes).toBe(0);
});
