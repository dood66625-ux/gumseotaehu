/** Real React components + intercepted SDK/API. No credentials, provider calls or charges. */
import { buildSync } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "playwright";
const oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bundle = buildSync({
  stdin: {
    contents:
      `import React from 'react';import{createRoot}from'react-dom/client';import Checkout from './components/Checkout';import PaymentReturn from './components/PaymentReturn';const p=new URL(location.href).searchParams;createRoot(document.getElementById('root')).render(p.has('return')?<PaymentReturn id={JSON.stringify(oid)} paymentKey={p.get('paymentKey')??undefined} amount={p.get('amount')??undefined}/>:<Checkout id="synthetic-reading" testReviewHref={p.has('review')?'https://pay.gumseo.kr/':undefined}/>);`.replace(
        "id={JSON.stringify(oid)}",
        `id="${oid}"`,
      ),
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
}).outputFiles[0].text;
let mode = "live",
  confirmation = "success",
  posts = [],
  sdkLoads = 0;
const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.end(bundle);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) =>
      console.error("Fixture error:", error.message),
    );
    await page.route("https://js.tosspayments.com/**", async (route) => {
      sdkLoads++;
      await route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: `window.__payments=[];window.TossPayments=()=>({widgets:()=>({setAmount:async a=>{window.__amount=a;},renderPaymentMethods:async o=>{document.querySelector(o.selector).textContent='카드';},renderAgreement:async o=>{let h;const b=document.createElement('button');b.type='button';b.textContent='카드 약관 동의';b.onclick=()=>h({agreedRequiredTerms:true});document.querySelector(o.selector).append(b);return{on:(_,f)=>{h=f;},getAgreementStatus:()=>({agreedRequiredTerms:false})};},requestPayment:async o=>{window.__payments.push(o);}})});`,
      });
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname.slice(5),
        body = request.postDataJSON();
      if (request.method() === "POST") posts.push({ path, body });
      let result = {};
      let status = 200;
      if (path === "session") result = { authenticated: mode !== "review" };
      else if (path === "payments/config") result = { mode };
      else if (path.startsWith("readings/"))
        result = {
          input: {
            name: "가상",
            date: "1995-05-15",
            calendar: "solar",
            time: "10:30",
            age: "19+",
          },
          chart: { target: 2027 },
        };
      else if (path === "orders" && request.method() === "POST")
        result = { id: oid };
      else if (path.startsWith("orders/"))
        result = {
          id: oid,
          payment: "pending",
          fulfillment: "waiting",
          expires: Date.now() + 86400000,
        };
      else if (path === "payments/prepare-live")
        result = {
          mode: "live",
          clientKey: "live_gck_synthetic_fixture_key",
          orderId: oid,
          amount: 22000,
          currency: "KRW",
          orderName: "금서태후 종합 운명서",
        };
      else if (path === "payments/live-return") {
        if (confirmation === "fail") {
          status = 503;
          result = { error: "확인 중" };
        } else result = { state: "verified" };
      } else if (
        path === "payments/authenticate" ||
        path === "payments/confirm"
      )
        throw Error("LIVE_CHECKOUT_USED_MOCK_PAYMENT");
      await route.fulfill({ status, json: result });
    });
    mode = "mock";
    posts = [];
    const before = sdkLoads;
    await page.goto(origin);
    await page
      .getByRole("button", { name: "운명서 펼치기 · 체험 결제" })
      .waitFor();
    if (sdkLoads !== before) throw Error("DEFAULT_MODE_LOADED_LIVE_SDK");
    mode = "review";
    posts = [];
    await page.goto(origin + "/?review=1");
    const reviewLink = page.getByRole("link", {
      name: "운명서 펼치기 · 토스 테스트 결제",
    });
    await reviewLink.waitFor();
    if (
      (await reviewLink.getAttribute("href")) !== "https://pay.gumseo.kr/" ||
      (await page.locator("input[required]").count())
    )
      throw Error("REVIEW_CHECKOUT_BLOCKED_BY_AUTH_OR_CONSENT");
    if (sdkLoads !== before) throw Error("REVIEW_CHECKOUT_STARTED_PAYMENT");
    mode = "live";
    posts = [];
    await page.goto(origin);
    const choose = page.getByRole("button", { name: "카드 결제 수단 선택" });
    await choose.waitFor();
    for (const input of await page.locator("input[required]").all())
      await input.check();
    await choose.click();
    await page
      .getByRole("button", { name: "카드 약관 동의" })
      .waitFor()
      .catch(async (error) => {
        console.error(
          JSON.stringify({
            posts,
            sdkLoads,
            text: await page.locator("body").innerText(),
          }),
        );
        throw error;
      });
    const pay = page.getByRole("button", { name: "카드로 결제하기" });
    if (!(await pay.isDisabled())) throw Error("WIDGET_AGREEMENT_BYPASSED");
    await page.getByRole("button", { name: "카드 약관 동의" }).click();
    await pay.click();
    if (!(await pay.isDisabled())) throw Error("PAYMENT_REQUEST_NOT_LOCKED");
    const capture = await page.evaluate(() => ({
      amount: window.__amount,
      payments: window.__payments,
    }));
    if (
      capture.amount.value !== 22000 ||
      capture.payments.length !== 1 ||
      capture.payments[0].successUrl !== origin + "/checkout/success"
    )
      throw Error("WIDGET_REQUEST_NOT_BOUND");
    if (
      posts.filter((p) => p.path === "orders").length !== 1 ||
      posts.some((p) => p.path === "payments/live-return")
    )
      throw Error("CARD_LAUNCH_CONFIRMED_PAYMENT");
    confirmation = "success";
    posts = [];
    await page.goto(
      origin + "/?return=1&paymentKey=synthetic-key-012345&amount=22000",
    );
    await page.getByText("결제 확인 대기", { exact: true }).waitFor();
    if (posts.filter((p) => p.path === "payments/live-return").length !== 1)
      throw Error("RETURN_NOT_CONFIRMED_ONCE");
    if (page.url().includes("paymentKey="))
      throw Error("ACKNOWLEDGED_CALLBACK_NOT_CLEANED");
    if (await page.getByRole("link", { name: "운명서 전체 읽기" }).count())
      throw Error("URL_SUCCESS_TRUSTED_WITHOUT_SERVER_STATE");
    confirmation = "fail";
    posts = [];
    await page.goto(
      origin + "/?return=1&paymentKey=synthetic-key-012345&amount=22000",
    );
    await page.getByRole("button", { name: "같은 주문 다시 확인" }).waitFor();
    await page.waitForTimeout(100);
    if (posts.filter((p) => p.path === "payments/live-return").length !== 1)
      throw Error("RETURN_AUTO_RETRIED");
    confirmation = "success";
    await page.getByRole("button", { name: "같은 주문 다시 확인" }).click();
    await page.waitForFunction(() => !location.search.includes("paymentKey="));
    if (posts.filter((p) => p.path === "payments/live-return").length !== 2)
      throw Error("MANUAL_RETURN_RECHECK_FAILED");
    posts = [];
    await page.goto(
      origin + "/?return=1&paymentKey=synthetic-key-012345&amount=bad",
    );
    await page.getByRole("alert").waitFor();
    if (posts.some((p) => p.path === "payments/live-return"))
      throw Error("MALFORMED_RETURN_SUBMITTED");
    await page.close();
  }
  console.log(
    JSON.stringify({
      passed: true,
      widths: [390, 1440],
      defaultSdkRequests: 0,
      widgetAgreement: true,
      reviewLinkWithoutAuth: true,
      serverAmount: true,
      oneRequest: true,
      callbackConfirmation: true,
      noAutoRetry: true,
      serverStateAuthoritative: true,
      providerRequests: 0,
    }),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
