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
