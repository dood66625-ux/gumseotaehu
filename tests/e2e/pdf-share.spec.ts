import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const report = JSON.parse(
  readFileSync("public/merchant-review/index.html", "utf8").match(
    /<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1],
).report;
test("PDF save shares a prepared PDF under fresh user activation and never a private URL", async ({
  page,
}) => {
  let pdfReads = 0;
  await page.addInitScript(() => {
    const agent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: agent + " KAKAOTALK",
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data: any) => Array.isArray(data.files),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: any) => {
        (window as any).__pdfShare = {
          name: data.files?.[0]?.name,
          type: data.files?.[0]?.type,
          size: data.files?.[0]?.size,
          url: data.url,
          active: navigator.userActivation.isActive,
        };
        throw new DOMException("dismissed", "AbortError");
      },
    });
  });
  await page.route("**/api/reports/synthetic-share", (r) =>
    r.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-share/counsel", (r) =>
    r.fulfill({ json: { entries: [], remaining: 3, total: 3 } }),
  );
  await page.route("**/api/reports/synthetic-share/pdf", (r) => {
    pdfReads++;
    return r.fulfill({
      contentType: "application/pdf",
      body: "%PDF-1.4\nsynthetic file\n%%EOF",
    });
  });
  await page.goto("/report/synthetic-share");
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  const save = page.getByRole("button", { name: "PDF 저장", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__pdfShare?.name))
    .toBe("geumseo-report.pdf");
  const shared = await page.evaluate(() => (window as any).__pdfShare);
  expect(shared).toMatchObject({ type: "application/pdf", active: true });
  expect(shared.size).toBeGreaterThan(10);
  expect(shared.url).toBeUndefined();
  await expect(
    page.getByRole("alert").filter({ hasText: "공유창을 열지" }),
  ).toHaveCount(0);
  expect(pdfReads).toBe(1);
  await save.click();
  expect(pdfReads).toBe(1);
  await expect(
    page.getByText(
      "사주의 특징을 이야기로 풀어낸 금서태후의 캐릭터 타입이니라.",
      { exact: true },
    ),
  ).toHaveCount(0);
});

test("a reply arriving in the overview refreshes the prepared PDF and visible transcript", async ({
  page,
}) => {
  let finished = false,
    reads = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: any) => {
        (window as any).__latestSharedPdf = await data.files[0].text();
      },
    });
  });
  await page.route("**/api/reports/synthetic-late", (r) =>
    r.fulfill({ json: report }),
  );
  await page.route("**/api/reports/synthetic-late/counsel", (r) =>
    r.fulfill({
      json: {
        entries: [
          {
            id: "late-answer-1",
            number: 1,
            question: "새 답문을 기다리노라",
            answer: finished ? "새로 도착한 답문이니라." : null,
            state: finished ? "ready" : "queued",
            created: Date.now(),
          },
        ],
        remaining: 2,
        total: 3,
      },
    }),
  );
  await page.route("**/api/reports/synthetic-late/pdf", (r) => {
    reads++;
    return r.fulfill({
      contentType: "application/pdf",
      body:
        "%PDF-1.4\n" +
        (finished ? "with-new-answer" : "before-answer") +
        "\n%%EOF",
    });
  });
  await page.goto("/report/synthetic-late");
  await page.getByRole("button", { name: "전체 운명서", exact: true }).click();
  const save = page.getByRole("button", { name: "PDF 저장", exact: true });
  await expect(save).toBeEnabled();
  expect(reads).toBe(1);
  finished = true;
  await expect(page.locator(".report-counsel-transcript")).toContainText(
    "새로 도착한 답문이니라.",
  );
  await expect.poll(() => reads).toBe(2);
  await expect(save).toBeEnabled();
  await save.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__latestSharedPdf))
    .toContain("with-new-answer");
});
