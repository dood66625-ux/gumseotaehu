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
