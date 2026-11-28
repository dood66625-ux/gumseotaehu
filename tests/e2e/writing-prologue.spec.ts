import { expect, test } from "@playwright/test";

test("writing story advances into the breathing wait without API requests", async ({
  page,
}) => {
  let apiCalls = 0;
  await page.clock.install();
  await page.route("**/api/**", (route) => {
    apiCalls++;
    return route.abort();
  });
  await page.goto("/preview/unsealing");
  await expect(page.getByLabel("운명서를 여는 이야기")).toBeVisible();
  await page.clock.runFor(5001);
  await expect(page.locator(".writing-scene.active figcaption")).toContainText(
    "갑목은 곧 큰 나무",
  );
  await page.clock.runFor(1000);
  await expect(page.locator(".writing-scene.active figcaption")).toContainText(
    "목의 글자가 눈에 띄는구나",
  );
  await page.clock.runFor(12001);
  await expect(
    page.getByRole("heading", { name: "운명서 펼치는 중…" }),
  ).toBeVisible();
  await expect(page.locator(".writing-prologue")).toHaveCount(0);
  const motion = await page
    .locator(".unsealing-mark")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(motion).toBe("4s");
  expect(apiCalls).toBe(0);
});

test("ready order interrupts the story immediately without waiting for skip or the next scene", async ({
  page,
}) => {
  let reads = 0;
  await page.clock.install();
  await page.route("**/api/orders/synthetic-prologue", (route) => {
    reads++;
    return route.fulfill({
      json: {
        id: "synthetic-prologue",
        writingLines: [
          "임수는 곧 흐르는 큰 물의 기운이니…",
          "수의 글자가 눈에 띄는구나.",
          "참으로 깊고 너른 기운을 품은 운명이로구나.",
        ],
        payment: "paid",
        fulfillment: reads === 1 ? "working" : "ready",
        expires: Date.now() + 86400000,
      },
    });
  });
  await page.goto("/checkout/success?orderId=synthetic-prologue");
  await expect(page.getByLabel("운명서를 여는 이야기")).toBeVisible();
  await expect(page.locator(".writing-scene.active figcaption")).toContainText(
    "임수는 곧 흐르는 큰 물",
  );
  await page.clock.runFor(1100);
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator(".writing-prologue")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "운명서가 펼쳐졌느니라." }),
  ).toBeVisible();
  await page.clock.runFor(2000);
  expect(reads).toBe(2);
});

test("skipped story stays skipped when a waiting order is refreshed", async ({
  page,
}) => {
  await page.route("**/api/orders/synthetic-prologue-refresh", (route) =>
    route.fulfill({
      json: {
        id: "synthetic-prologue-refresh",
        payment: "paid",
        fulfillment: "working",
        expires: Date.now() + 86400000,
      },
    }),
  );
  await page.goto("/checkout/success?orderId=synthetic-prologue-refresh");
  await page
    .getByRole("button", { name: "이야기 건너뛰고 작성 화면으로" })
    .click();
  await expect(
    page.getByRole("heading", { name: "운명서 펼치는 중…" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "운명서 펼치는 중…" }),
  ).toBeVisible();
  await expect(page.locator(".writing-prologue")).toHaveCount(0);
});

test("different sample day stems change both story and waiting narration without API calls", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/preview/unsealing?day=정");
  await expect(page.locator(".writing-scene.active figcaption")).toContainText(
    "정화는 곧 작은 등불",
  );
  await page
    .getByRole("button", { name: "이야기 건너뛰고 작성 화면으로" })
    .click();
  await expect(page.locator(".unsealing-personal-line")).toContainText(
    "정화는 곧 작은 등불",
  );
  await page.goto("/preview/unsealing?stage=wait&day=임");
  await expect(page.locator(".unsealing-personal-line")).toContainText(
    "임수는 곧 흐르는 큰 물",
  );
  expect(calls).toBe(0);
});
