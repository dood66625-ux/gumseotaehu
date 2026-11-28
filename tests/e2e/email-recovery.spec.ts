import { expect, test } from "@playwright/test";

test("recovery outage preserves retry; email challenge is bound to displayed address and expires", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/orders", async (route) => {
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary fixture outage" }),
      });
    return route.continue();
  });
  await page.goto("/recover");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "구매 내역을 불러오지 못했습니다" }),
  ).toBeVisible();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("이 이메일의 구매 내역이 없습니다.", { exact: false }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "구매 내역 다시 확인" }).click();
  await page
    .getByLabel("이메일 주소", { exact: true })
    .fill("first@example.invalid");
  await page
    .getByRole("button", { name: "인증번호 요청", exact: true })
    .click();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("first@example.invalid 주소의 인증번호입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /초 후 다시 요청/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "이메일 주소 수정" }).click();
  await expect(page.getByLabel("인증번호 6자리")).toHaveCount(0);
  await page
    .getByLabel("이메일 주소", { exact: true })
    .fill("second@example.invalid");
  await page.clock.install();
  await page
    .getByRole("button", { name: "인증번호 요청", exact: true })
    .click();
  await expect(
    page.getByText("second@example.invalid 주소의 인증번호입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("button", { name: "인증번호 다시 요청", exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(15 * 60000);
  await expect(
    page.getByRole("alert").filter({ hasText: "인증번호가 만료됐습니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이메일 인증 완료" }),
  ).toBeDisabled();
});

test("email change shows destination, clears old code after edit, and blocks expired confirmation", async ({
  page,
}) => {
  let requestCount = 0,
    confirmCount = 0;
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      json: [
        {
          id: "synthetic-email-change-order",
          created: Date.now(),
          amount: 22000,
          payment: "paid",
          fulfillment: "ready",
          expires: Date.now() + 86400000,
        },
      ],
    }),
  );
  await page.route("**/api/email-change/request", (route) => {
    requestCount++;
    return route.fulfill({
      json: { changeId: `synthetic-change-${requestCount}`, demoMail: true },
    });
  });
  await page.route("**/api/email-change/local-code", (route) =>
    route.fulfill({ json: { code: "123456" } }),
  );
  await page.route("**/api/email-change/confirm", (route) => {
    confirmCount++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/recover");
  await page.getByText("구매 이메일 변경", { exact: true }).click();
  await page.getByLabel("새 구매 이메일").fill("typo@example.invalid");
  await page.getByRole("button", { name: "새 이메일 확인 요청" }).click();
  await expect(
    page.getByText("typo@example.invalid 주소의 변경 인증번호입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "변경용 체험 인증번호 확인" }).click();
  await expect(page.getByTestId("change-otp")).toHaveText("123456");
  await page
    .getByRole("button", { name: "새 이메일 수정 · 다시 요청" })
    .click();
  await expect(page.getByTestId("change-otp")).toHaveCount(0);
  await expect(page.getByLabel("새 구매 이메일")).toHaveValue(
    "typo@example.invalid",
  );
  await page.getByLabel("새 구매 이메일").fill("correct@example.invalid");
  await page.clock.install();
  await page.getByRole("button", { name: "새 이메일 확인 요청" }).click();
  await expect(
    page.getByText("correct@example.invalid 주소의 변경 인증번호입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("이메일 변경 인증번호")).toHaveValue("");
  await page.clock.fastForward(15 * 60000 + 1000);
  await expect(
    page.getByRole("alert").filter({ hasText: "변경 인증번호가 만료됐습니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이메일 변경 확정" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "변경용 체험 인증번호 확인" }),
  ).toBeDisabled();
  expect(confirmCount).toBe(0);
  expect(requestCount).toBe(2);
});
