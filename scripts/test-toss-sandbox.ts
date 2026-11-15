/** Browser contract tests: all provider requests intercepted, fake client key, no real external calls. */
import { chromium, webkit, devices } from "@playwright/test";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createTossSandboxHandler } from "../lib/integrations/toss-sandbox-web";
const origin = "http://127.0.0.1:3212";
const oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let payment = "pending",
  confirms = 0,
  refunds = 0,
  recoveries = 0,
  authenticated = false,
  deferRefund = false;
const handler = createTossSandboxHandler({
  origin,
  clientKey: "test_gck_fixture",
  merchantConfigured: true,
  clientScript: readFileSync("scripts/toss-sandbox-client.mjs", "utf8"),
  backend: {
    state: () => ({
      id: oid,
      payment,
      fulfillment: payment === "paid" ? "ready" : "waiting",
    }),
    confirm: async () => {
      confirms++;
      payment = "paid";
      return { state: "verified" };
    },
    recover: async () => {
      recoveries++;
      return { state: payment === "paid" ? "verified" : "review" };
    },
    login: () => {
      authenticated = true;
    },
    refund: async () => {
      assert.ok(authenticated);
      if (deferRefund) return { state: "processing" };
      refunds++;
      payment = "refunded";
      return { state: "refunded" };
    },
    pdf: async () => Buffer.from("%PDF-fake"),
  },
});
const server = createServer(async (req, res) => {
  const request = new Request(origin + req.url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    ...(req.method === "POST"
      ? { body: Readable.toWeb(req), duplex: "half" }
      : {}),
  } as RequestInit);
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(3212, "127.0.0.1", resolve);
});
const sdk = `window.qaCalls=[];window.TossPayments=key=>({widgets:options=>{window.qaCalls.push({key,options});return {setAmount:async value=>window.qaCalls.push(value),renderPaymentMethods:async()=>{document.querySelector('#methods').textContent='테스트 카드';},renderAgreement:async()=>{document.querySelector('#agreement').textContent='테스트 약관';},requestPayment:async options=>{window.qaCalls.push(options);location.href=options.successUrl+'?orderId='+options.orderId+'&paymentKey=opaque-test-key&amount=22000';}};}});`;
try {
  for (const engine of [
    "mobile-chromium",
    "mobile-webkit",
    "desktop-chromium",
  ]) {
    payment = "pending";
    authenticated = false;
    const before = confirms;
    const browser = await (
      engine === "mobile-webkit" ? webkit : chromium
    ).launch({
      headless: true,
      ...(engine === "mobile-webkit" && process.env.WEBKIT_EXECUTABLE
        ? { executablePath: process.env.WEBKIT_EXECUTABLE }
        : {}),
    });
    try {
      const context = await browser.newContext(
        engine === "mobile-webkit"
          ? devices["iPhone 13"]
          : engine === "mobile-chromium"
            ? devices["Pixel 7"]
            : devices["Desktop Chrome"],
      );
      let external = 0,
        sdkAttempts = 0;
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (url === "https://js.tosspayments.com/v2/standard") {
          sdkAttempts++;
          if (sdkAttempts === 1) return route.abort();
          return route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: sdk,
          });
        }
        if (!url.startsWith(origin + "/")) {
          external++;
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.locator("#load").click();
      await page
        .getByRole("status")
        .filter({ hasText: "불러오지 못했습니다" })
        .waitFor();
      await page.locator("#load").click();
      await page.locator("#pay:not([disabled])").waitFor();
      const calls = await page.evaluate(() => (window as any).qaCalls);
      assert.equal(calls[0].options.customerKey, "ANONYMOUS");
      assert.deepEqual(calls[1], { currency: "KRW", value: 22000 });
      await page.locator("#pay").click();
      await page
        .getByRole("status")
        .filter({ hasText: "테스트 결제가 확인되었습니다" })
        .waitFor();
      assert.equal(confirms, before + 1);
      assert.equal(new URL(page.url()).search, "");
      await page.reload();
      await page.waitForTimeout(100);
      assert.equal(confirms, before + 1);
      await page.goto(
        origin +
          "/success?orderId=" +
          oid +
          "&paymentKey=secret-callback-value&amount=1",
      );
      await page
        .getByRole("status")
        .filter({ hasText: "일치하지 않습니다" })
        .waitFor();
      assert.equal(confirms, before + 1);
      assert.equal(new URL(page.url()).search, "");
      await page.goto(
        origin +
          "/success?orderId=" +
          oid +
          "&paymentKey=a&amount=22000&amount=22000",
      );
      await page
        .getByRole("status")
        .filter({ hasText: "일치하지 않습니다" })
        .waitFor();
      assert.equal(confirms, before + 1);
      await page.goto(origin + "/fail?message=private-provider-error");
      await page
        .getByRole("status")
        .filter({ hasText: "취소되었거나 실패" })
        .waitFor();
      assert.ok(!(await page.content()).includes("private-provider-error"));
      const recoverBefore = recoveries;
      await page.locator("#recover").click();
      await page
        .getByRole("status")
        .filter({ hasText: "상태를 확인했습니다" })
        .waitFor();
      assert.equal(recoveries, recoverBefore + 1);
      await page.goto(origin + "/admin");
      assert.equal(
        await page.evaluate(() => !!(window as any).TossPayments),
        false,
      );
      await page.locator("#password").fill("fake-admin");
      await page.locator("#code").fill("123456");
      await page.locator("#login button").click();
      await page.locator("#refund:not([disabled])").waitFor();
      const refundBefore = refunds;
      deferRefund = true;
      await page.locator("#refund").click();
      await page
        .getByRole("status")
        .filter({ hasText: "취소 상태를 확인 중입니다" })
        .waitFor();
      assert.equal(refunds, refundBefore);
      deferRefund = false;
      await page.locator("#refund").click();
      await page
        .getByRole("status")
        .filter({ hasText: "전액 취소 상태" })
        .waitFor();
      assert.equal(refunds, refundBefore + 1);
      assert.equal(await page.locator("#password").inputValue(), "");
      assert.equal(external, 0);
      console.log(
        engine +
          ": SDK retry, anonymous customer, server amount, callback/refresh, tampering, failure, recovery, authenticated refund passed (provider fully intercepted)",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
