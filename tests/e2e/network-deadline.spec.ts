import { expect, test } from "@playwright/test";

test("hung recovery request releases loading and allows read-only retry without asking for a new payment", async ({
  page,
}) => {
  let stalled = true,
    calls = 0;
  await page.clock.install();
  await page.route("**/api/orders", (route) => {
    calls++;
    if (stalled) return;
    return route.fulfill({ json: [] });
  });
  await page.goto("/recover");
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(20001);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "구매 내역을 불러오지 못했습니다" }),
  ).toBeVisible();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  stalled = false;
  await page.getByRole("button", { name: "구매 내역 다시 확인" }).click();
  await expect(
    page.getByText("이 이메일의 구매 내역이 없습니다.", { exact: false }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test("a lost support POST acknowledgement exits busy state with uncertainty and never auto-resubmits", async ({
  page,
}) => {
  let submitted = 0;
  await page.clock.install();
  await page.route("**/api/orders", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/tickets", (route) => {
    if (route.request().method() === "POST") {
      submitted++;
      return;
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/help");
  await page.getByLabel("문의 내용").fill("가상 연결 장애 문의입니다.");
  await page
    .getByRole("button", { name: "문의 접수하기", exact: true })
    .click();
  await expect.poll(() => submitted).toBe(1);
  await page.clock.fastForward(20001);
  await expect(
    page.getByRole("alert").filter({ hasText: "다시 요청하기 전에" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "문의 접수하기", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("문의 내용")).toHaveValue(
    "가상 연결 장애 문의입니다.",
  );
  await page.clock.fastForward(60000);
  expect(submitted).toBe(1);
});

test("checkout read timeout offers a read-only retry without creating an order", async ({
  page,
}) => {
  let stalled = true,
    reads = 0,
    mutations = 0;
  await page.clock.install();
  await page.route("**/api/readings/synthetic-reading", (route) => {
    reads++;
    if (stalled) return;
    return route.fulfill({
      json: {
        input: {
          name: "가상검수",
          date: "1995-05-15",
          calendar: "solar",
          time: "10:30",
          age: "19+",
        },
        chart: { target: 2027 },
      },
    });
  });
  await page.route("**/api/orders", (route) => {
    mutations++;
    return route.fulfill({
      status: 500,
      json: { error: "unexpected synthetic mutation" },
    });
  });
  await page.goto("/checkout?id=synthetic-reading");
  await expect.poll(() => reads).toBe(1);
  await page.clock.fastForward(20001);
  await expect(
    page.getByRole("button", { name: "출생정보 다시 확인" }),
  ).toBeVisible();
  stalled = false;
  await page.getByRole("button", { name: "출생정보 다시 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "출생정보 확인" }),
  ).toBeVisible();
  expect(reads).toBe(2);
  expect(mutations).toBe(0);
});
