import { expect, it, vi } from "vitest";
import { createResendMailGateway } from "../lib/integrations/resend-mail";
const key = "mail-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const message = {
  from: "archive@example.invalid",
  to: "buyer@example.invalid",
  replyTo: "support@example.invalid",
  subject: "금서태후 인증",
  text: "가상 인증번호 123456",
  html: "<p>가상 인증번호 123456</p>",
};
function fixture() {
  const send = vi.fn<typeof fetch>();
  const gateway = createResendMailGateway({
    apiKey: "re_synthetic_fixture_only",
    accountScope: "synthetic",
    enabled: true,
    fetch: send,
  });
  return { send, gateway };
}
const evidence = (last_event = "delivered") => ({
  id,
  last_event,
  tags: [{ name: "gumseo_key", value: key }],
});
it("defaults to blocked and does not make provider requests", async () => {
  const send = vi.fn<typeof fetch>();
  const g = createResendMailGateway({
    apiKey: "re_synthetic_fixture_only",
    accountScope: "synthetic",
    fetch: send,
  });
  await expect(g.send(message, key)).rejects.toThrow("NOT_APPROVED");
  expect(send).not.toHaveBeenCalled();
});
it("sends a fixed transaction envelope once with stable idempotency/tag and no extra personal fields", async () => {
  const f = fixture();
  f.send.mockResolvedValue(Response.json({ id }));
  expect(await f.gateway.send(message, key)).toEqual({ key, providerId: id });
  expect(f.send).toHaveBeenCalledOnce();
  const [url, init] = f.send.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init?.redirect).toBe("error");
  expect(init?.headers).toMatchObject({ "Idempotency-Key": key });
  expect(JSON.parse(init?.body as string)).toEqual({
    from: message.from,
    to: [message.to],
    reply_to: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    tags: [{ name: "gumseo_key", value: key }],
  });
});
it("returns unknown without network when a lost acknowledgement leaves no provider ID", async () => {
  const f = fixture();
  expect(await f.gateway.lookup(key)).toEqual({ key, state: "unknown" });
  expect(f.send).not.toHaveBeenCalled();
});
it.each([
  "delivered",
  "complained",
  "sent",
  "opened",
  "bounced",
  "failed",
  "unexpected",
])("maps %s conservatively from independent lookup", async (event) => {
  const f = fixture();
  f.send.mockResolvedValue(Response.json(evidence(event)));
  const r = await f.gateway.lookup(key, undefined, id);
  expect(r.state).toBe(
    event === "delivered"
      ? "delivered"
      : event === "complained"
        ? "complained"
        : ["sent", "opened"].includes(event)
          ? "accepted"
          : "unknown",
  );
  expect(r.state).not.toBe("not_sent");
});
it("rejects a different provider ID or transaction tag", async () => {
  const f = fixture();
  f.send.mockResolvedValue(
    Response.json({
      ...evidence(),
      tags: [{ name: "gumseo_key", value: "mail-other" }],
    }),
  );
  await expect(f.gateway.lookup(key, undefined, id)).rejects.toThrow(
    "MISMATCH",
  );
});
it.each([401, 409, 429, 500])(
  "redacts provider errors for HTTP %i without automatic resend",
  async (status) => {
    const f = fixture();
    f.send.mockResolvedValue(
      new Response("private-recipient-and-provider-details", { status }),
    );
    await expect(f.gateway.send(message, key)).rejects.toThrow(
      new Error("RESEND_HTTP_" + status),
    );
    expect(f.send).toHaveBeenCalledOnce();
  },
);
it("rejects extra fields, header injection and arbitrary IDs before network", async () => {
  const f = fixture();
  await expect(
    f.gateway.send({ ...message, attachments: [] } as any, key),
  ).rejects.toThrow();
  await expect(
    f.gateway.send(
      { ...message, subject: "x\r\nBcc: other@example.invalid" },
      key,
    ),
  ).rejects.toThrow();
  await expect(f.gateway.lookup(key, undefined, "../../other")).rejects.toThrow(
    "ID_REQUIRED",
  );
  expect(f.send).not.toHaveBeenCalled();
});
it("bounds provider responses and masks network failure details", async () => {
  const f = fixture();
  f.send
    .mockResolvedValueOnce(new Response("x".repeat(129 * 1024)))
    .mockRejectedValueOnce(Error("private credential"));
  await expect(f.gateway.send(message, key)).rejects.toThrow("TOO_LARGE");
  await expect(f.gateway.send(message, key)).rejects.toThrow(
    new Error("RESEND_NETWORK_RECONCILIATION_REQUIRED"),
  );
});
it("forwards cancellation without leaking the caller abort reason", async () => {
  const f = fixture(),
    c = new AbortController();
  c.abort(Error("private reason"));
  f.send.mockImplementation(async (_url, init) => {
    if (init?.signal?.aborted) throw init.signal.reason;
    return Response.json({ id });
  });
  await expect(f.gateway.send(message, key, c.signal)).rejects.toThrow(
    "TIMEOUT_RECONCILIATION_REQUIRED",
  );
});
