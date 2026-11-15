import { expect, it, vi } from "vitest";
import { createTossSandboxHandler } from "../lib/integrations/toss-sandbox-web";
const origin = "http://127.0.0.1:3211";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture(mid = true) {
  const backend = {
    state: vi.fn(() => ({ id, payment: "pending", fulfillment: "waiting" })),
    confirm: vi.fn(async () => ({ state: "verified" })),
    recover: vi.fn(async () => ({ state: "verified" })),
    refund: vi.fn(async () => ({ state: "refunded" })),
    login: vi.fn(),
    pdf: vi.fn(async () => Buffer.from("%PDF-fixture")),
  };
  const handle = createTossSandboxHandler({
    origin,
    clientKey: "test_gck_fixture",
    merchantConfigured: mid,
    backend,
    clientScript: "/* offline test */",
  });
  let cookie = "";
  const request = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    handle(
      new Request(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          host: "127.0.0.1:3211",
          cookie,
          ...(body === undefined
            ? {}
            : { origin, "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return {
    backend,
    handle,
    request,
    async start() {
      const res = await request("/");
      cookie = res.headers.get("set-cookie")!.split(";")[0];
      return res;
    },
  };
}
it("requires a numeric loopback origin and only widget test client keys", () => {
  const f = fixture();
  for (const address of [
    "http://localhost:3211",
    "https://127.0.0.1:3211",
    "http://0.0.0.0:3211",
    "https://customer.example",
  ])
    expect(() =>
      createTossSandboxHandler({
        origin: address,
        clientKey: "test_gck_fixture",
        merchantConfigured: true,
        backend: f.backend,
        clientScript: "",
      }),
    ).toThrow("LOOPBACK");
  expect(() =>
    createTossSandboxHandler({
      origin,
      clientKey: "live_gck_fixture",
      merchantConfigured: true,
      backend: f.backend,
      clientScript: "",
    }),
  ).toThrow();
});
it("protects state, script and PDF with an HttpOnly Lax local cookie; refuses DNS rebinding", async () => {
  const f = fixture();
  expect((await f.request("/state")).status).toBe(401);
  const page = await f.start();
  expect(page.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
  expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  expect(page.headers.get("cache-control")).toContain("no-store");
  expect(await page.text()).not.toContain('id="password"');
  const adminPage = await f.request("/admin");
  expect(await adminPage.text()).not.toContain('id="load"');
  expect(adminPage.headers.get("content-security-policy")).not.toContain(
    "tosspayments",
  );
  expect((await f.request("/state")).status).toBe(200);
  expect(
    (await f.request("/state", undefined, { host: "attacker.example:3211" }))
      .status,
  ).toBe(403);
  expect(
    (await f.request("/", undefined, { "sec-fetch-site": "cross-site" }))
      .status,
  ).toBe(403);
  expect(
    (await f.request("/success", undefined, { "sec-fetch-site": "cross-site" }))
      .status,
  ).toBe(200);
});
it("missing MID blocks all payment effects before a backend call", async () => {
  const f = fixture(false);
  await f.start();
  for (const path of ["/confirm", "/recover", "/refund"])
    expect((await f.request(path, {})).status).toBe(503);
  expect(f.backend.confirm).not.toHaveBeenCalled();
  expect(f.backend.recover).not.toHaveBeenCalled();
  expect(f.backend.refund).not.toHaveBeenCalled();
});
it("validates callback against the fixed server order and 22000; never accepts user/customer fields", async () => {
  const f = fixture();
  await f.start();
  const valid = { orderId: id, paymentKey: "opaque key", amount: 22000 };
  for (const changes of [
    { amount: 33000 },
    { amount: "22000" },
    { orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { paymentKey: "\nprivate" },
    { customerEmail: "real@example.com" },
  ])
    expect(
      (await f.request("/confirm", { ...valid, ...changes })).status,
    ).toBeGreaterThanOrEqual(400);
  expect(f.backend.confirm).not.toHaveBeenCalled();
  expect((await f.request("/confirm", valid)).status).toBe(200);
  expect(f.backend.confirm).toHaveBeenCalledWith("opaque key", 22000);
});
it("rejects cross-origin, bad content types, extra fields and oversized bodies", async () => {
  const f = fixture();
  await f.start();
  expect(
    (await f.request("/recover", {}, { origin: "https://other.example" }))
      .status,
  ).toBe(403);
  expect(
    (await f.request("/recover", {}, { "content-type": "text/plain" })).status,
  ).toBe(415);
  expect((await f.request("/recover", { orderId: id })).status).toBe(400);
  expect(
    (await f.request("/recover", { value: "a".repeat(3000) })).status,
  ).toBe(413);
  expect(f.backend.recover).not.toHaveBeenCalled();
});
it("does not trust GET success or provider messages; errors never include provider/secret text", async () => {
  const f = fixture();
  await f.start();
  const page = await f.request(
    "/success?orderId=" + id + "&amount=22000&paymentKey=opaque-private",
  );
  expect(await page.text()).not.toContain("opaque-private");
  expect(f.backend.confirm).not.toHaveBeenCalled();
  f.backend.recover.mockRejectedValueOnce(Error("private-provider-secret"));
  const res = await f.request("/recover", {});
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain("private-provider-secret");
});
it("wires authenticated cancellation and local PDF without enabling AI or mail", async () => {
  const f = fixture();
  await f.start();
  expect(
    (await f.request("/login", { password: "local-password", code: "123456" }))
      .status,
  ).toBe(200);
  expect(f.backend.login).toHaveBeenCalledWith("local-password", "123456");
  expect((await f.request("/refund", {})).status).toBe(200);
  expect(f.backend.refund).toHaveBeenCalledOnce();
  expect((await f.request("/pdf")).headers.get("content-type")).toBe(
    "application/pdf",
  );
});
