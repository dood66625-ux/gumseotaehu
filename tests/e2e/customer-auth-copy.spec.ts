import { test, expect } from "@playwright/test";

for (const demoMail of [false, true]) {
  test(`authentication exposes demo controls only when explicitly allowed: ${demoMail}`, async ({
    page,
  }) => {
    await page.route("**/api/orders", (route) =>
      route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } }),
    );
    await page.route("**/api/auth/request", (route) =>
      route.fulfill({
        json: { challengeId: "synthetic-copy-check", demoMail },
      }),
    );
    await page.goto("/recover");
    await expect(
      page.getByText("현재 체험판에서는 실제 이메일을 발송하지 않습니다."),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "체험용 인증번호 확인" }),
    ).toHaveCount(0);
    await page
      .getByLabel("이메일 주소", { exact: true })
      .fill("synthetic@example.invalid");
    await page
      .getByRole("button", { name: "인증번호 요청", exact: true })
      .click();
    await expect(page.getByLabel("인증번호 6자리")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "체험용 인증번호 확인" }),
    ).toHaveCount(demoMail ? 1 : 0);
  });
}

test("commercial email changes do not expose local verification controls", async ({
  page,
}) => {
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      json: [
        {
          id: "synthetic-copy-order",
          created: Date.now(),
          amount: 22000,
          payment: "paid",
          fulfillment: "ready",
          expires: Date.now() + 86400000,
          livePayment: true,
        },
      ],
    }),
  );
  await page.route("**/api/email-change/request", (route) =>
    route.fulfill({
      json: { changeId: "synthetic-copy-change", demoMail: false },
    }),
  );
  await page.goto("/recover");
  await page.getByText("구매 이메일 변경", { exact: true }).click();
  await page.getByLabel("새 구매 이메일").fill("synthetic@example.invalid");
  await page.getByRole("button", { name: "새 이메일 확인 요청" }).click();
  await expect(page.getByLabel("이메일 변경 인증번호")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "변경용 체험 인증번호 확인" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("로컬 검증판은 실제 이메일을 발송하지 않습니다."),
  ).toHaveCount(0);
});
