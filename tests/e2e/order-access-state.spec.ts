import { expect, test } from "@playwright/test";
const base = {
  id: "synthetic-access",
  payment: "paid",
  fulfillment: "ready",
  expires: Date.now() + 86400000,
  amount: 22000,
  created: Date.now(),
  deleted: false,
};
for (const scenario of [
  {
    name: "refunded",
    patch: { payment: "refunded" },
    heading: "전액 취소가 완료되었습니다.",
  },
  {
    name: "deleted",
    patch: { deleted: true },
    heading: "운명서 원문이 삭제되었습니다.",
  },
  {
    name: "expired",
    patch: { expires: 1 },
    heading: "무료 재열람 기간이 종료되었습니다.",
  },
])
  test(`closed ${scenario.name} order has no read link or endless working message`, async ({
    page,
  }) => {
    let reads = 0;
    await page.clock.install();
    await page.route("**/api/orders/synthetic-access", (route) => {
      reads++;
      return route.fulfill({ json: { ...base, ...scenario.patch } });
    });
    await page.goto("/checkout/success?orderId=synthetic-access");
    await expect(
      page.getByRole("heading", { name: scenario.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "운명서 전체 읽기" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("창을 닫아도 운명서 작성은 계속됩니다.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "주문 상태 다시 확인" }),
    ).toBeVisible();
    await page.clock.fastForward(6000);
    expect(reads).toBe(1);
  });

test("cancellation pending blocks reading without pretending the refund is complete", async ({
  page,
}) => {
  await page.route("**/api/orders/synthetic-access", (route) =>
    route.fulfill({ json: { ...base, payment: "refund_pending" } }),
  );
  await page.goto("/checkout/success?orderId=synthetic-access");
  await expect(
    page.getByRole("heading", {
      name: "취소 처리 상태를 확인하고 있습니다.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "운명서 전체 읽기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "전액 취소가 완료되었습니다.",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("recovery lists historical orders without giving read or email-change controls to closed orders", async ({
  page,
}) => {
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      json: [
        { ...base, id: "refund", payment: "refunded" },
        { ...base, id: "deleted", deleted: true },
        { ...base, id: "expired", expires: 1 },
        { ...base, id: "valid", livePayment: true },
      ],
    }),
  );
  await page.goto("/recover");
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 3; i++) {
    await expect(
      cards.nth(i).getByRole("link", { name: "같은 운명서 다시 읽기" }),
    ).toHaveCount(0);
    await expect(
      cards.nth(i).getByText("구매 이메일 변경", { exact: true }),
    ).toHaveCount(0);
  }
  await expect(cards.nth(3)).not.toContainText("(모의)");
  await expect(cards.nth(0)).toContainText("(모의)");
  await expect(
    cards.nth(3).getByRole("link", { name: "같은 운명서 다시 읽기" }),
  ).toBeVisible();
  await expect(
    cards.nth(3).getByText("구매 이메일 변경", { exact: true }),
  ).toBeVisible();
});

test("recovery removes read and email-change controls when the displayed expiry passes", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/api/orders", (route) =>
    route.fulfill({ json: [{ ...base, expires: Date.now() + 60000 }] }),
  );
  await page.goto("/recover");
  await expect(
    page.getByRole("link", { name: "같은 운명서 다시 읽기" }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByText("열람기한 종료", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "같은 운명서 다시 읽기" }),
  ).toHaveCount(0);
  await expect(page.getByText("구매 이메일 변경", { exact: true })).toHaveCount(
    0,
  );
});
