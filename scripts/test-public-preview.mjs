import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const base =
  process.env.PUBLIC_PREVIEW_ORIGIN || "http://127.0.0.1:3200/gumseotaehu/";
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  page = await context.newPage();
const go = (screen) => {
  const url = new URL(base);
  url.searchParams.set("v", "royal-10");
  if (screen) url.searchParams.set("screen", screen);
  return page.goto(url.toString());
};
const errors = [],
  apiRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());
});
try {
  await go();
  if (!(await page.locator(".book-price").textContent()).includes("22,000"))
    throw Error("Preview price is stale");
  await page.getByRole("link", { name: "내 사주 펼쳐보기" }).click();
  if (
    (await page.getByLabel("이용자·구매자 연령").count()) ||
    (await page.getByLabel("출생 국가·시간대 확인").count())
  )
    throw Error("Removed selectors still visible");
  for (const name of ["어떻게 불러드릴까요?", "생년월일", "출생시간"]) {
    const n = page.getByLabel(name, { exact: true });
    if (
      !(await n.getAttribute("readonly")) &&
      (await n.getAttribute("readonly")) !== ""
    )
      throw Error("Personal input not locked: " + name);
  }
  await page.getByRole("button", { name: "다음 →" }).click();
  await page.getByRole("button", { name: "다음 →" }).click();
  await page.getByRole("checkbox", { name: /풀이 대상자는 본인/ }).check();
  await page.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  await page.getByRole("button", { name: "무료 사주풀이 펼치기" }).click();
  await page.getByRole("link", { name: "종합 운명서 구매 살펴보기" }).click();
  await page.getByLabel("이메일 주소").waitFor();
  if (!(await page.locator(".price").textContent()).includes("22,000"))
    throw Error("Checkout price mismatch");
  if (
    (await page.getByLabel("이메일 주소").inputValue()) !==
    "preview@example.invalid"
  )
    throw Error("Synthetic email missing");
  await page.getByRole("button", { name: "인증번호 요청" }).click();
  await page.getByRole("button", { name: "체험용 인증번호 확인" }).click();
  await page.getByLabel("인증번호 6자리").fill("123456");
  await page.getByRole("button", { name: "이메일 인증 완료" }).click();
  await page.getByText("구매 이메일 인증이 완료되었습니다.").waitFor();
  const tampered = await page.evaluate(async () => {
    const data = JSON.parse(
      document.getElementById("preview-data").textContent,
    );
    const r = await fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: data.report.order.id,
        paymentKey: "synthetic-no-real-payment",
        amount: 33000,
      }),
    });
    return r.status;
  });
  if (tampered !== 400)
    throw Error("Old price incorrectly accepted by preview adapter");
  for (const c of await page.locator("form").last().getByRole("checkbox").all())
    if ((await c.getAttribute("name")) !== "marketing") await c.check();
  await page.getByRole("button", { name: "운명서 펼치기 · 체험 결제" }).click();
  await page.getByRole("link", { name: "운명서 전체 읽기" }).click();
  await page.getByRole("heading", { name: "가온 님의 종합 운명서" }).waitFor();
  await page
    .locator(".chapter-illustration img")
    .evaluateAll(async (images) => {
      if (images.length !== 9) throw Error("Chapter artwork missing");
      for (const image of images) {
        image.loading = "eager";
        await image.decode();
      }
    });
  const evidence = page.locator(".chapter-evidence").first();
  if ((await evidence.getAttribute("open")) !== null)
    throw Error("Chapter evidence should start collapsed");
  await evidence.locator("summary").click();
  if (!(await evidence.locator("small").isVisible()))
    throw Error("Chapter evidence cannot be opened");
  await page.locator(".report-method summary").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 다운로드" }).click();
  await (await download).saveAs("var/public-preview-proof.pdf");
  await page.screenshot({
    path: "docs/public-preview-report.png",
    fullPage: true,
  });
  await go("recover");
  await page.getByRole("link", { name: "같은 운명서 다시 읽기" }).waitFor();
  await go("help");
  await page.getByRole("button", { name: "문의 접수하기" }).click();
  await page
    .getByRole("article")
    .getByText("가상 미리보기 문의입니다. 실제 상담 접수가 아닙니다.")
    .waitFor();
  await go("recover");
  await page.getByText("구매 이메일 변경", { exact: true }).click();
  const changedEmail = page.getByLabel("새 구매 이메일");
  if (
    (await changedEmail.inputValue()) !== "preview-corrected@example.invalid" ||
    (await changedEmail.getAttribute("readonly")) === null
  )
    throw Error("New email not locked to synthetic fixture");
  await page.getByRole("button", { name: "새 이메일 확인 요청" }).click();
  await page.getByRole("button", { name: "변경용 체험 인증번호 확인" }).click();
  await page.getByLabel("이메일 변경 인증번호").fill("123456");
  await page.getByRole("button", { name: "이메일 변경 확정" }).click();
  await page.getByRole("link", { name: "새 이메일로 인증하기" }).click();
  if (
    (await page.getByLabel("이메일 주소").inputValue()) !==
    "preview-corrected@example.invalid"
  )
    throw Error("Changed synthetic email missing");
  await page.getByRole("button", { name: "인증번호 요청" }).click();
  await page.getByLabel("인증번호 6자리").fill("123456");
  await page.getByRole("button", { name: "이메일 인증 완료" }).click();
  await page.getByRole("link", { name: "같은 운명서 다시 읽기" }).waitFor();
  await go("business");
  await page
    .getByRole("definition")
    .filter({ hasText: "컬러픽쳐스" })
    .waitFor();
  await page.getByText("567-15-01262", { exact: true }).waitFor();
  await go("terms");
  await page
    .getByRole("heading", { name: "이용약관 · 검토용 초안", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "상품과 이용기간", exact: true })
    .waitFor();
  await go("privacy");
  await page
    .getByRole("heading", {
      name: "개인정보 처리방침 · 검토용 초안",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("heading", { name: "수탁·국외이전", exact: true })
    .waitFor();
  await page.locator("#privacy-officer-title").waitFor();
  await go("content");
  await page
    .getByRole("heading", { name: "운명서와 콘텐츠 안내", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "현재 체험 서비스", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "환불 및 취소 규정", exact: true })
    .first()
    .waitFor();
  await go("admin");
  await page.getByRole("heading", { name: "관리자 접근 제한" }).waitFor();
  if (errors.length || apiRequests.length)
    throw Error(JSON.stringify({ errors, apiRequests }));
  const result = {
    passed: true,
    flow: "landing → locked synthetic input → mock OTP/payment → report/PDF → recovery → synthetic inquiry → locked two-address email change; admin restricted",
    externalApiRequests: apiRequests.length,
    realPersonalInputEnabled: false,
    origin: base,
  };
  writeFileSync(
    "docs/public-preview-test.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
