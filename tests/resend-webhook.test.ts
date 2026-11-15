import { createHmac } from "node:crypto";
import { expect, it, vi, afterEach } from "vitest";
import { receiveResendWebhook } from "../lib/integrations/resend-webhook";
const secret = "whsec_" + Buffer.alloc(32, 11).toString("base64"),
  pid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const payload = () =>
  JSON.stringify({
    type: "email.bounced",
    data: {
      email_id: pid,
      to: ["synthetic@example.invalid"],
      bounce: { type: "Permanent" },
      subject: "가상 검증",
    },
  });
function request(
  raw = payload(),
  seconds = Math.floor(Date.now() / 1000),
  signatureOverride?: string,
) {
  const id = "msg_synthetic_fixture",
    timestamp = String(seconds);
  const signature = createHmac("sha256", Buffer.alloc(32, 11))
    .update(id + "." + timestamp + "." + raw)
    .digest("base64");
  return new Request("https://example.invalid/api/mail/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signatureOverride ?? "v1," + signature,
    },
    body: raw,
  });
}
function fixture() {
  const notify = vi.fn(() => ({ queued: true }));
  return { notify, options: { secret, coordinator: { notify } } };
}
afterEach(() => vi.useRealTimers());
it("verifies independent HMAC fixture with official Svix and queues only identifiers, never event status or addresses", async () => {
  const f = fixture();
  expect(await receiveResendWebhook(request(), f.options)).toEqual({
    accepted: true,
    queued: true,
  });
  expect(f.notify).toHaveBeenCalledWith({
    providerId: pid,
    eventId: "msg_synthetic_fixture",
  });
});
it.each([-301, 301])(
  "rejects replay/clock offset %i before queueing",
  async (offset) => {
    const f = fixture();
    await expect(
      receiveResendWebhook(
        request(payload(), Math.floor(Date.now() / 1000) + offset),
        f.options,
      ),
    ).rejects.toThrow("AUTHENTICATION_FAILED");
    expect(f.notify).not.toHaveBeenCalled();
  },
);
it("rejects invalid signature, key and byte changes", async () => {
  const f = fixture();
  await expect(
    receiveResendWebhook(
      request(
        payload(),
        undefined,
        "v1," + Buffer.alloc(32).toString("base64"),
      ),
      f.options,
    ),
  ).rejects.toThrow("AUTHENTICATION_FAILED");
  const r = request();
  const headers = r.headers;
  await expect(
    receiveResendWebhook(
      new Request(r.url, { method: "POST", headers, body: payload() + " " }),
      f.options,
    ),
  ).rejects.toThrow("AUTHENTICATION_FAILED");
  await expect(
    receiveResendWebhook(request(), { ...f.options, secret: "whsec_bad" }),
  ).rejects.toThrow("CONFIG_REQUIRED");
  const original = request();
  await expect(
    receiveResendWebhook(
      new Request(original.url, {
        method: "POST",
        headers: original.headers,
        body: "\uFEFF" + payload(),
      }),
      f.options,
    ),
  ).rejects.toThrow("AUTHENTICATION_FAILED");
  expect(f.notify).not.toHaveBeenCalled();
});
it("supports signature rotation and ignores unsupported event types", async () => {
  const f = fixture(),
    r = request();
  r.headers.set(
    "svix-signature",
    "v1," +
      Buffer.alloc(32).toString("base64") +
      " " +
      r.headers.get("svix-signature"),
  );
  expect((await receiveResendWebhook(r, f.options)).queued).toBe(true);
  f.notify.mockClear();
  expect(
    (
      await receiveResendWebhook(
        request(JSON.stringify({ type: "email.opened" })),
        f.options,
      )
    ).queued,
  ).toBe(false);
  expect(f.notify).not.toHaveBeenCalled();
});
it("rejects oversize bodies without declared length, oversized signature headers and wrong content type", async () => {
  const f = fixture();
  await expect(
    receiveResendWebhook(request("x".repeat(65537)), f.options),
  ).rejects.toThrow("TOO_LARGE");
  const h = request();
  h.headers.set("svix-signature", "x".repeat(4097));
  await expect(receiveResendWebhook(h, f.options)).rejects.toThrow(
    "AUTHENTICATION_FAILED",
  );
  const t = request();
  t.headers.set("content-type", "text/plain");
  await expect(receiveResendWebhook(t, f.options)).rejects.toThrow(
    "JSON_REQUIRED",
  );
  expect(f.notify).not.toHaveBeenCalled();
});
it("enforces a total body read deadline", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    r = request();
  const hanging = new Request(r.url, {
    method: "POST",
    headers: r.headers,
    body: new ReadableStream({ start() {} }),
    duplex: "half",
  } as RequestInit);
  const result = expect(
    receiveResendWebhook(hanging, f.options),
  ).rejects.toThrow("TIMEOUT");
  await vi.advanceTimersByTimeAsync(3001);
  await result;
  expect(f.notify).not.toHaveBeenCalled();
});
it("rejects signed malformed data rather than accepting a provider ID supplied outside the payload", async () => {
  const f = fixture();
  await expect(
    receiveResendWebhook(
      request(
        JSON.stringify({
          type: "email.delivered",
          data: { email_id: "invalid" },
        }),
      ),
      f.options,
    ),
  ).rejects.toThrow("INVALID_EVENT");
  await expect(
    receiveResendWebhook(request("{invalid-json"), f.options),
  ).rejects.toThrow("INVALID_EVENT");
  expect(f.notify).not.toHaveBeenCalled();
});
it("keeps the real HTTP route disabled before reading request bodies or opening a DB", async () => {
  vi.stubEnv("RESEND_WEBHOOK_MODE", "");
  try {
    const { POST } = await import("../app/api/mail/webhook/route");
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("MAIL_WEBHOOK_DISABLED");
  } finally {
    vi.unstubAllEnvs();
  }
});
