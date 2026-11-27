import { expect, it, vi } from "vitest";
import { probePublicAvailability } from "../scripts/public-availability.mjs";
const headers = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=86400",
};
function healthy(url: string) {
  if (url.endsWith("/.env") || url.endsWith("/.git/config"))
    return new Response(null, { status: 404 });
  if (url.endsWith("/api/admin/export"))
    return new Response(null, { status: 401 });
  if (url.endsWith("/site.css"))
    return new Response(
      ".hero-portrait {} .birth-wizard {} .report-reader {}",
      { headers: { ...headers, "content-type": "text/css; charset=utf-8" } },
    );
  if (url.endsWith("/start"))
    return new Response('<form class="birth-wizard"><input id="name"></form>', {
      headers,
    });
  if (url.endsWith("/recover"))
    return new Response(
      '구매 이메일 인증 후 <script src="/_next/static/app.js"></script>',
      { headers },
    );
  return new Response('금서태후 <a href="/start">내 사주 펼쳐보기</a>', {
    headers,
  });
}
it("only reads fixed commercial paths anonymously and keeps unverified operations explicit", async () => {
  const send = vi.fn(async (url: string) => healthy(url)),
    result = await probePublicAvailability(send as typeof fetch);
  expect(result).toMatchObject({
    scope: "public-commercial-surface-availability-only",
    healthy: true,
    privateHostVerified: false,
    backupFreshnessVerified: false,
    providerOperationsVerified: false,
    alertDeliveryVerified: false,
  });
  expect(result).not.toHaveProperty("customerMailEnabled");
  expect(send.mock.calls.map((c) => c[0])).toEqual([
    "https://gumseo.kr/",
    "https://gumseo.kr/start",
    "https://gumseo.kr/recover",
    "https://gumseo.kr/site.css",
    "https://gumseo.kr/.env",
    "https://gumseo.kr/.git/config",
    "https://gumseo.kr/api/admin/export",
  ]);
  for (const call of send.mock.calls as unknown as [string, RequestInit][]) {
    expect(call[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
    expect(call[1].headers).toBeUndefined();
    expect(call[1].body).toBeUndefined();
  }
});
it.each([
  "http",
  "wrong-body",
  "oversize",
  "exception",
  "mime",
  "missing-header",
  "invalid-utf8",
  "demo",
])("fails closed for %s without leaking responses", async (mode) => {
  const send = vi.fn(async (url: string) => {
    if (url !== "https://gumseo.kr/") return healthy(url);
    if (mode === "http")
      return new Response("private upstream detail", { status: 503 });
    if (mode === "exception") throw Error("private exception detail");
    if (mode === "oversize")
      return new Response("private upstream detail".repeat(14000), { headers });
    if (mode === "mime")
      return new Response("private upstream detail", {
        headers: { ...headers, "content-type": "application/json" },
      });
    if (mode === "missing-header")
      return new Response("private upstream detail", {
        headers: { "content-type": "text/html" },
      });
    if (mode === "invalid-utf8")
      return new Response(new Uint8Array([255]), { headers });
    if (mode === "demo")
      return new Response(
        '금서태후 <a href="/start">내 사주 펼쳐보기</a> 실제 결제 없음',
        { headers },
      );
    return new Response("private upstream detail", { headers });
  });
  const result = await probePublicAvailability(send as typeof fetch);
  expect(result.healthy).toBe(false);
  expect(result.checks[0].passed).toBe(false);
  expect(result.checks.slice(1).every((c) => c.passed)).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private upstream detail");
  expect(JSON.stringify(result)).not.toContain("exception detail");
});
it.each(["/.env", "/.git/config", "/api/admin/export"])(
  "never reads an unexpectedly public protected response at %s",
  async (suffix) => {
    const response = new Response("private upstream detail", { status: 200 });
    const getReader = vi.spyOn(response.body!, "getReader"),
      cancel = vi.spyOn(response.body!, "cancel");
    const result = await probePublicAvailability((async (url: string) =>
      url.endsWith(suffix) ? response : healthy(url)) as typeof fetch);
    expect(result.healthy).toBe(false);
    expect(
      result.checks.find((c) => c.code === "PROTECTION_CHECK_FAILED"),
    ).toMatchObject({ passed: false, httpStatus: 200 });
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
  },
);
it("rejects an HTML fallback masquerading as the customer stylesheet", async () => {
  const result = await probePublicAvailability((async (url: string) =>
    url.endsWith("/site.css")
      ? new Response("private upstream detail", { headers })
      : healthy(url)) as typeof fetch);
  expect(result.healthy).toBe(false);
  expect(result.checks.find((c) => c.id === "customer-styles")).toMatchObject({
    code: "CONTENT_TYPE_INVALID",
  });
});
