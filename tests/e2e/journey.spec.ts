import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DatabaseSync } from "node:sqlite";
import { config } from "../../lib/config";
import { totp } from "../../lib/security";
config();
const origin = "http://localhost:3000";
const birth = {
  name: "가온",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "female",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
};
async function post(page: Page, path: string, body: any = {}) {
  return page.request.post("/api/" + path, { headers: { origin }, data: body });
}
async function auth(page: Page, email: string) {
  await post(page, "session");
  const r = await (await post(page, "auth/request", { email })).json();
  const mail = await (
    await page.request.get("/api/local-mail/" + r.challengeId)
  ).json();
  expect(
    (
      await post(page, "auth/verify", {
        challengeId: r.challengeId,
        code: mail.code,
      })
    ).ok(),
  ).toBeTruthy();
}
async function freshAdminCode() {
  const latest = () => {
    const database = new DatabaseSync("var/e2e.sqlite", { readOnly: true });
    try {
      return Number(
        database
          .prepare(
            "SELECT COALESCE(MAX(last_step),0) AS step FROM admin_totp_replay",
          )
          .get()?.step ?? 0,
      );
    } finally {
      database.close();
    }
  };
  const used = latest();
  await expect
    .poll(() => Math.floor(Date.now() / 30000) + 1, { timeout: 35000 })
    .toBeGreaterThan(used);
  const step = Math.max(Math.floor(Date.now() / 30000), used + 1);
  return totp(process.env.ADMIN_TOTP_SECRET!, step * 30000);
}
async function createPaid(page: Page, email: string, close = false) {
  await auth(page, email);
  const reading = await (await post(page, "readings", birth)).json();
  const order = await (
    await post(page, "orders", {
      readingId: reading.id,
      consent: {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
      },
    })
  ).json();
  const p = await (
    await post(page, "payments/authenticate", {
      orderId: order.id,
      scenario: close ? "close" : "success",
    })
  ).json();
  if (!close)
    expect(
      (
        await post(page, "payments/confirm", {
          orderId: order.id,
          paymentKey: p.paymentKey,
          amount: 22000,
        })
      ).ok(),
    ).toBeTruthy();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + order.id)).json())
          .fulfillment,
    )
    .toBe("ready");
  return order.id as string;
}

test("landing remains usable without API; responsive, reduced motion and accessibility", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator(".book-price")).toContainText("22,000");
  await expect(page.locator("body")).not.toContainText("33,000원");
  await expect(
    page.getByRole("link", { name: "내 사주 펼쳐보기" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".hero-portrait img")
      .evaluate((n: HTMLImageElement) => n.complete && n.naturalWidth > 0),
  ).toBeTruthy();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: "docs/" + info.project.name + "-landing.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const cta = await page
    .getByRole("link", { name: "내 사주 펼쳐보기" })
    .boundingBox();
  expect(cta!.y + cta!.height).toBeLessThanOrEqual(740);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((r) => r.name.includes("/_next/")),
    ),
  ).toBe(false);
  await page.getByRole("link", { name: "스토리 건너뛰기" }).click();
  await expect(page).toHaveURL(/\/start$/);
});

test("complete mobile UI journey: birth, preview, verified checkout, report, PDF, recovery, inquiry, admin refund", async ({
  page,
}, info) => {
  test.setTimeout(75000);
  const email = `journey-${info.project.name}@example.invalid`;
  await page.goto("/start");
  await page.getByLabel("어떻게 불러드릴까요?").fill("가온");
  await page.getByLabel("생년월일").fill("1995-05-15");
  await page.getByLabel("출생시간", { exact: true }).fill("10:30");
  await page.getByLabel("전통 대운 계산 구분").selectOption("female");
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("checkbox").nth(2).check();
  await page.getByRole("button", { name: "무료 사주풀이 펼치기" }).click();
  await expect(page.getByText("만세력 계산 완료 · 첫 번째 풀이")).toBeVisible();
  await expect(page.locator(".price")).toContainText("22,000원");
  await page.screenshot({
    path: "docs/" + info.project.name + "-preview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "종합 운명서 구매 살펴보기" }).click();
  await expect(page.locator(".price")).toContainText("22,000원");
  await page.getByLabel("이메일 주소").fill(email);
  await page.getByRole("button", { name: "인증번호 요청" }).click();
  await page.getByRole("button", { name: "체험용 인증번호 확인" }).click();
  const code = await page.getByTestId("otp").textContent();
  await page.getByLabel("인증번호 6자리").fill(code!);
  await page.getByRole("button", { name: "이메일 인증 완료" }).click();
  await expect(
    page.getByText("구매 이메일 인증이 완료되었습니다."),
  ).toBeVisible();
  for (const c of await page
    .locator("form")
    .last()
    .getByRole("checkbox")
    .all()) {
    const name = await c.getAttribute("name");
    if (name !== "marketing") await c.check();
  }
  await page.getByRole("button", { name: "운명서 펼치기 · 체험 결제" }).click();
  await expect(
    page.getByRole("link", { name: "운명서 전체 읽기" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "운명서 전체 읽기" }).click();
  await expect(
    page.getByRole("heading", { name: "가온 님의 종합 운명서" }),
  ).toBeVisible();
  const oid = page.url().split("/").pop()!;
  await page.screenshot({
    path: "docs/" + info.project.name + "-report.png",
    fullPage: true,
    scale: "css",
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("geumseo-report.pdf");
  await file.saveAs("docs/" + info.project.name + "-report.pdf");
  await page.getByRole("button", { name: "이메일로 받기" }).click();
  await expect(
    page.getByText(
      "로컬 발송함에 재열람 안내를 저장했습니다. 실제 발송은 하지 않았습니다.",
    ),
  ).toBeVisible();
  const before = await (await page.request.get("/api/reports/" + oid)).json();
  await post(page, "logout");
  await page.goto("/recover");
  await auth(page, email);
  await page.reload();
  await page.getByRole("link", { name: "같은 운명서 다시 읽기" }).click();
  const after = await (await page.request.get("/api/reports/" + oid)).json();
  expect(after.report).toEqual(before.report);
  await page.goto("/help");
  await page.getByLabel("관련 주문").selectOption(oid);
  await page.getByLabel("문의 내용").fill("모의 결제 환불을 요청합니다.");
  await page.getByRole("button", { name: "문의 접수하기" }).click();
  await expect(page.getByText("모의 결제 환불을 요청합니다.")).toBeVisible();
  await page.goto("/admin");
  await page.getByLabel("운영자 비밀번호").fill(process.env.ADMIN_PASSWORD!);
  await page.getByLabel("1회용 인증코드").fill(await freshAdminCode());
  await page.getByRole("button", { name: "관리자 로그인" }).click();
  await expect(page.getByRole("heading", { name: "운영 현황" })).toBeVisible();
  await page.getByLabel("주문번호", { exact: true }).fill(oid);
  await page.getByLabel("처리 종류").selectOption("refund");
  await page
    .getByLabel("검토 근거·본인확인·처리 사유")
    .fill("모의 주문 고객 요청과 결제 원장 대조 완료");
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
  await page.screenshot({
    path: "docs/" + info.project.name + "-admin.png",
    fullPage: true,
  });
  expect((await page.request.get("/api/reports/" + oid)).status()).toBe(403);
});

test("closed tab is recovered by worker and foreign session cannot obtain report or PDF", async ({
  page,
  browser,
}, info) => {
  const email = `closed-${info.project.name}@example.invalid`,
    oid = await createPaid(page, email, true);
  const report = await (await page.request.get("/api/reports/" + oid)).json();
  expect(report.order.payment).toBe("paid");
  const other = await browser.newContext();
  const p = await other.newPage();
  await auth(p, `other-${info.project.name}@example.invalid`);
  expect((await p.request.get("/api/reports/" + oid)).status()).toBe(404);
  expect((await p.request.get("/api/reports/" + oid + "/pdf")).status()).toBe(
    404,
  );
  await other.close();
});

test("API rejects CSRF, amount tampering, fake callback, minor payment and admin bypass", async ({
  page,
}, info) => {
  const email = `security-${info.project.name}@example.invalid`;
  await auth(page, email);
  const csrf = await page.request.post("/api/readings", {
    headers: { origin: "https://evil.invalid" },
    data: birth,
  });
  expect(csrf.status()).toBe(403);
  const r = await (await post(page, "readings", birth)).json(),
    o = await (
      await post(page, "orders", {
        readingId: r.id,
        consent: {
          terms: true,
          privacy: true,
          withdrawal: true,
          confirmedBirth: true,
          buyerAdult: true,
        },
      })
    ).json();
  expect(
    (
      await post(page, "payments/confirm", {
        orderId: o.id,
        paymentKey: "fake",
        amount: 1,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(page, "payments/confirm", {
        orderId: o.id,
        paymentKey: "fake",
        amount: 22000,
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.get("/api/reports/" + o.id)).status()).toBe(403);
  const { age: removedAge, place: removedCountry, ...minimal } = birth;
  const minimalReading = await (await post(page, "readings", minimal)).json();
  const inputView = await (
    await page.request.get("/api/readings/" + minimalReading.id)
  ).json();
  expect(inputView.input.place).toBe("KR");
  expect(inputView.input.age).toBe("unconfirmed");
  expect(
    (
      await post(page, "orders", {
        readingId: minimalReading.id,
        consent: {
          terms: true,
          privacy: true,
          withdrawal: true,
          confirmedBirth: true,
        },
      })
    ).status(),
  ).toBe(400);
  const younger = await (
    await post(page, "readings", { ...minimal, date: "2010-05-15" })
  ).json();
  expect(
    (
      await post(page, "orders", {
        readingId: younger.id,
        consent: {
          terms: true,
          privacy: true,
          withdrawal: true,
          confirmedBirth: true,
          buyerAdult: true,
        },
      })
    ).status(),
  ).toBe(403);
  const minor = await (
    await post(page, "readings", { ...birth, age: "14-18" })
  ).json();
  expect(
    (
      await post(page, "orders", {
        readingId: minor.id,
        guardianConsent: true,
        consent: {
          terms: true,
          privacy: true,
          withdrawal: true,
          confirmedBirth: true,
          buyerAdult: true,
        },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/admin")).status()).toBe(403);
  expect(
    (
      await post(page, "admin/refund", {
        orderId: o.id,
        reason: "위조 환불 시도",
      })
    ).status(),
  ).toBe(403);
});

test("simplified input keeps 14+ consent and Korea default without age/country selectors", async ({
  page,
}) => {
  await page.goto("/start");
  await expect(page.getByLabel("이용자·구매자 연령")).toHaveCount(0);
  await expect(page.getByLabel("출생 국가·시간대 확인")).toHaveCount(0);
  await expect(page.getByLabel("생년월일")).toBeVisible();
  await expect(
    page.getByText(
      "한국 표준시(Asia/Seoul) 기준으로 계산합니다. 해외 출생은 현재 지원하지 않습니다.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /만 14세 이상/ }),
  ).toBeVisible();
  await page.getByLabel("출생시간을 모릅니다").check();
  await expect(page.getByLabel("출생시간", { exact: true })).toBeDisabled();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("landing image and native CTA work with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 667 },
  });
  const p = await context.newPage();
  await p.goto("/");
  await expect(p.getByRole("link", { name: "내 사주 펼쳐보기" })).toBeVisible();
  await p.getByRole("link", { name: "내 사주 펼쳐보기" }).click();
  await expect(p).toHaveURL(/\/start$/);
  await context.close();
});

test("concurrent confirmation requests settle once", async ({ page }, info) => {
  await auth(page, `concurrent-${info.project.name}@example.invalid`);
  const r = await (await post(page, "readings", birth)).json();
  const o = await (
    await post(page, "orders", {
      readingId: r.id,
      consent: {
        terms: true,
        privacy: true,
        withdrawal: true,
        confirmedBirth: true,
        buyerAdult: true,
      },
    })
  ).json();
  const p = await (
    await post(page, "payments/authenticate", {
      orderId: o.id,
      scenario: "success",
    })
  ).json();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      post(page, "payments/confirm", {
        orderId: o.id,
        paymentKey: p.paymentKey,
        amount: 22000,
      }),
    ),
  );
  expect(responses.every((r) => r.status() === 200)).toBe(true);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + o.id)).json())
          .fulfillment,
    )
    .toBe("ready");
  const first = await (await page.request.get("/api/reports/" + o.id)).json(),
    second = await (await page.request.get("/api/reports/" + o.id)).json();
  expect(first.id).toBe(second.id);
  expect(first.report).toEqual(second.report);
});

test("ambiguous solar-term input returns a recoverable error before reading or purchase", async ({
  page,
}) => {
  await post(page, "session");
  for (const time of [null, "16:13"]) {
    const response = await post(page, "readings", {
      ...birth,
      date: "1995-02-04",
      time,
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("절기가");
    expect(body.id).toBeUndefined();
  }
  const valid = await post(page, "readings", {
    ...birth,
    date: "1995-02-04",
    time: "18:00",
  });
  expect(valid.status()).toBe(201);
  const saved = await valid.json();
  expect(saved.id).toBeTruthy();
});

test("purchase email change verifies both addresses and retains the exact report", async ({
  page,
}, info) => {
  const oldEmail = `change-${info.project.name}@example.invalid`,
    newEmail = `changed-${info.project.name}@example.invalid`;
  const oid = await createPaid(page, oldEmail);
  const before = await (await page.request.get("/api/reports/" + oid)).json();
  await page.goto("/recover");
  await page.getByText("구매 이메일 변경", { exact: true }).click();
  await page.getByLabel("새 구매 이메일").fill(newEmail);
  await page.getByRole("button", { name: "새 이메일 확인 요청" }).click();
  await page.getByRole("button", { name: "변경용 체험 인증번호 확인" }).click();
  await page
    .getByLabel("이메일 변경 인증번호")
    .fill((await page.getByTestId("change-otp").textContent())!);
  await page.getByRole("button", { name: "이메일 변경 확정" }).click();
  await expect(page.getByRole("status")).toContainText("이메일이 변경");
  expect((await page.request.get("/api/reports/" + oid)).status()).toBe(401);
  await auth(page, newEmail);
  const after = await (await page.request.get("/api/reports/" + oid)).json();
  expect(after.report).toEqual(before.report);
  await post(page, "logout");
  await auth(page, oldEmail);
  expect((await page.request.get("/api/reports/" + oid)).status()).toBe(404);
});
test("admin login rotates session, rejects TOTP replay and revokes elevated sessions", async ({
  page,
  playwright,
}) => {
  test.setTimeout(75000);
  await post(page, "session");
  const oldCookie = (await page.context().cookies()).find(
    (c) => c.name === "gs_session",
  )!;
  const code = await freshAdminCode();
  expect(
    (
      await post(page, "admin/login", {
        password: process.env.ADMIN_PASSWORD,
        code,
      })
    ).status(),
  ).toBe(200);
  const newCookie = (await page.context().cookies()).find(
    (c) => c.name === "gs_session",
  )!;
  expect(newCookie.value).not.toBe(oldCookie.value);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.get("/api/admin", {
          headers: { cookie: "gs_session=" + oldCookie.value },
        })
      ).status(),
    ).toBe(401);
    await other.post("/api/session", { headers: { origin }, data: {} });
    expect(
      (
        await other.post("/api/admin/login", {
          headers: { origin },
          data: { password: process.env.ADMIN_PASSWORD, code },
        })
      ).status(),
    ).toBe(401);
    expect(
      (await page.request.get("/api/admin?query=not-a-valid-order")).status(),
    ).toBe(400);
    expect((await post(page, "admin/revoke-sessions")).status()).toBe(200);
    expect((await page.request.get("/api/admin")).status()).toBe(401);
  } finally {
    await other.dispose();
  }
});

test("test PG webhook stays disabled and cannot be used as a browser payment callback", async ({
  request,
}) => {
  const response = await request.post("/api/toss/webhook", {
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example.invalid",
    },
    data: {
      eventType: "PAYMENT_STATUS_CHANGED",
      data: {
        orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "DONE",
        totalAmount: 22000,
      },
    },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    error: "TOSS_TEST_WEBHOOK_DISABLED",
  });
  expect(response.headers()["cache-control"]).toContain("no-store");
});
