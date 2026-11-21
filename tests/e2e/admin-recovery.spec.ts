import { expect, test } from "@playwright/test";
const oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const overview = (payment = "paid") => ({
  orders: [
    {
      id: oid,
      email: "synthetic…",
      amount: 22000,
      payment,
      fulfillment: "ready",
    },
  ],
  tickets: [],
  jobs: [],
  refunds: [],
  audit: [],
  events: [],
  mailCount: 0,
  metrics: { gross: 22000, refunds: payment === "refunded" ? 22000 : 0 },
});

test("admin overview outage offers read-only retry instead of asking for another login", async ({
  page,
}) => {
  let unavailable = true;
  await page.route(/\/api\/admin\?query=/, (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: "synthetic outage" } })
      : route.fulfill({ json: overview() }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "운영 현황 조회 오류" }),
  ).toBeVisible();
  await expect(page.getByLabel("운영자 비밀번호")).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "처리 내역 다시 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "운영 현황", exact: true }),
  ).toBeVisible();
});

test("refund acknowledgement remains visible through refresh failure and retry does not execute another action", async ({
  page,
}) => {
  let unavailable = false,
    actions = 0;
  await page.route(/\/api\/admin\?query=/, (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: "synthetic outage" } })
      : route.fulfill({ json: overview(actions ? "refunded" : "paid") }),
  );
  await page.route("**/api/admin/refund", (route) => {
    actions++;
    unavailable = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "환불", exact: true }).click();
  await page
    .getByLabel("검토 근거·본인확인·처리 사유")
    .fill("가상 주문의 모의 환불 검토입니다.");
  await page
    .getByRole("checkbox", {
      name: "대상 주문, 본인확인 및 법정 소비자 권리를 검토했습니다.",
    })
    .check();
  await page
    .getByRole("button", { name: "선택 주문 모의 전액 환불", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "처리가 기록되었습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "업무를 다시 실행하지 말고" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택 주문 모의 전액 환불", exact: true }),
  ).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "처리 내역 다시 확인" }).click();
  await expect(page.getByRole("row").filter({ hasText: oid })).toContainText(
    "refunded",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "처리가 기록되었습니다." }),
  ).toBeVisible();
  expect(actions).toBe(1);
});

test("expired admin authority clears protected data and requests fresh authentication", async ({
  page,
}) => {
  let expired = false;
  await page.route(/\/api\/admin\?query=/, (route) =>
    expired
      ? route.fulfill({
          status: 403,
          json: { error: "synthetic revoked authority" },
        })
      : route.fulfill({ json: overview() }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "운영 현황", exact: true }),
  ).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByLabel("운영자 비밀번호")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(oid);
  await expect(
    page.getByRole("button", { name: "처리 내역 다시 확인" }),
  ).toHaveCount(0);
});

test("invalid order search can be corrected without repeating login or an action", async ({
  page,
}) => {
  await page.route(/\/api\/admin\?query=/, (route) =>
    new URL(route.request().url()).searchParams.get("query") ===
    "invalid-search"
      ? route.fulfill({
          status: 400,
          json: { error: "주문번호의 앞부분을 입력해 주세요." },
        })
      : route.fulfill({ json: overview() }),
  );
  await page.goto("/admin");
  await page
    .getByLabel("주문번호 검색", { exact: true })
    .fill("invalid-search");
  await page.getByRole("button", { name: "주문 검색", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "운영 현황 조회 오류" }),
  ).toBeVisible();
  await page.getByLabel("주문번호 조회 조건", { exact: true }).fill("");
  await page.getByRole("button", { name: "처리 내역 다시 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "운영 현황", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("운영자 비밀번호")).toHaveCount(0);
});

test("held AI costs are readable and selecting the order sends no retry or release command", async ({
  page,
}) => {
  let writes = 0;
  await page.route(/\/api\/admin(?:[/?]|$)/, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.fulfill({
        status: 400,
        json: { error: "Unexpected action" },
      });
    }
    return route.fulfill({
      json: {
        ...overview(),
        aiSpendReview: {
          available: true,
          entries: [
            {
              orderId: oid,
              version: 1,
              state: "uncertain",
              reservedUsdMicros: 60000,
              estimatedUsdMicros: null,
            },
          ],
        },
      },
    });
  });
  await page.goto("/admin");
  const review = page.getByRole("region", {
    name: "AI 처리 확인이 필요한 주문",
  });
  await expect(review).toBeVisible();
  await expect(review).toContainText("$0.0600");
  await expect(review).toContainText("미확인");
  await review.getByRole("button", { name: "주문 확인", exact: true }).click();
  await expect(page.getByLabel("주문번호", { exact: true })).toHaveValue(oid);
  expect(writes).toBe(0);
});

test("live refunds distinguish pending acknowledgement, read-only checks and explicit retries", async ({
  page,
}) => {
  let state = "paid";
  const actions: string[] = [];
  await page.route(/\/api\/admin\?query=/, (route) =>
    route.fulfill({
      json: {
        ...overview(state),
        orders: overview(state).orders.map((o) => ({
          ...o,
          livePayment: true,
        })),
      },
    }),
  );
  for (const action of ["refund", "refund-check", "refund-retry"])
    await page.route("**/api/admin/" + action, (route) => {
      if (action !== "refund-check")
        expect(route.request().postDataJSON().confirmLiveRefund).toBe(true);
      actions.push(action);
      state = action === "refund-retry" ? "refunded" : "refund_pending";
      return route.fulfill({
        json: {
          state:
            action === "refund-retry"
              ? "refunded"
              : action === "refund"
                ? "processing"
                : "review",
        },
      });
    });
  await page.goto("/admin");
  await page.getByRole("button", { name: "환불", exact: true }).click();
  await expect(
    page.getByText("운영 주문이며 실행 시 실제 토스 전액 취소를 요청합니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("PG 취소 실패를 시험합니다", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByLabel("검토 근거·본인확인·처리 사유")
    .fill("가상 운영 주문의 미제공 검토입니다.");
  await page
    .getByRole("checkbox", {
      name: "대상 주문, 본인확인 및 법정 소비자 권리를 검토했습니다.",
    })
    .check();
  await page
    .getByRole("button", { name: "선택 운영 주문 전액 취소", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "추가 취소 없이" }),
  ).toBeVisible();
  expect(actions).toEqual(["refund"]);
  await page
    .getByRole("button", { name: "환불 처리 확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "선택 업무 실행", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "전액 취소가 아직 확인되지" }),
  ).toBeVisible();
  await page.getByLabel("처리 종류").selectOption("refund-retry");
  await page
    .getByRole("checkbox", {
      name: "최근 조회 결과가 미취소 상태임을 확인했고, 같은 주문의 전액 취소 재시도를 요청합니다.",
    })
    .check();
  await page
    .getByRole("button", {
      name: "선택 운영 주문 전액 취소 재시도",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "토스 전액 취소를 확인" }),
  ).toBeVisible();
  expect(actions).toEqual(["refund", "refund-check", "refund-retry"]);
});

test("editing a refund order to an unknown ID cannot execute a financial action", async ({
  page,
}) => {
  let writes = 0;
  await page.route(/\/api\/admin\?query=/, (route) =>
    route.fulfill({
      json: {
        ...overview(),
        orders: overview().orders.map((o) => ({ ...o, livePayment: true })),
      },
    }),
  );
  await page.route("**/api/admin/refund", (route) => {
    writes++;
    return route.fulfill({ json: { state: "refunded" } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "환불", exact: true }).click();
  await page
    .getByLabel("주문번호", { exact: true })
    .fill("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  await expect(
    page.getByText("주문번호로 검색한 뒤 목록에서 환불 대상을 선택해 주세요."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택 주문 모의 전액 환불", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(0);
});
