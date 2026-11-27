import { it, expect, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import PolicyDraft from "../components/PolicyDraft";
afterEach(() => vi.unstubAllEnvs());
it("shows the actual customer AI/mail handling in sales policies while preserving demo copy separately", () => {
  const live = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "privacy", live: true }),
  );
  expect(live).toContain("OpenAI(미국)");
  expect(live).toContain("Resend(미국)");
  expect(live).not.toContain("POLICY DRAFT");
  const business = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "business", live: true }),
  );
  expect(business).not.toContain("공개 운영 중이 아닙니다");
  expect(business).not.toContain("OWNER_ACTION_REQUIRED");
  const terms = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "terms", live: true }),
  );
  expect(terms).not.toContain("별도 비공개 AI 풀이");
  const demo = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "privacy" }),
  );
  expect(demo).toContain("POLICY DRAFT");
});
it("keeps prior privacy links navigable with a same-site redirect", async () => {
  const { GET } = await import("../app/route");
  const response = GET(
    new Request("https://gumseo.kr/?v=royal-12&screen=privacy"),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/legal/privacy");
});
it("explains the active product and three counsel questions without demo or unavailable-chat claims", async () => {
  const { default: ContentGuide } = await import("../components/ContentGuide");
  const content = renderToStaticMarkup(
    createElement(ContentGuide, { live: true }),
  );
  expect(content).toContain("22,000");
  expect(content).toContain("세 번");
  expect(content).not.toMatch(
    /현재 공개 화면은 가상|실제 구매와 고객 이메일 발송은 제공하지 않습니다/,
  );
  const terms = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "terms", live: true }),
  );
  expect(terms).not.toContain("AI 채팅은 제공하지 않습니다");
  expect(terms).toContain("세 번");
  const business = renderToStaticMarkup(
    createElement(PolicyDraft, { slug: "business", live: true }),
  );
  expect(business).not.toContain("고지 준비 중");
});
it("indexes only public commercial pages and keeps personal routes out of discovery", async () => {
  const { default: robots } = await import("../app/robots");
  const { default: sitemap } = await import("../app/sitemap");
  expect(sitemap()).toEqual([]);
  vi.stubEnv("TOSS_PAYMENT_MODE", "live");
  vi.stubEnv("LIVE_PAYMENTS_APPROVAL", "live-payments-approved");
  const pages = sitemap();
  expect(pages.length).toBeGreaterThan(0);
  expect(pages.every((p) => !p.url.match(/\/report\/|\/admin|\/api\//))).toBe(
    true,
  );
  expect(robots().rules).toMatchObject({
    disallow: expect.arrayContaining(["/report/", "/admin", "/api/"]),
  });
});
