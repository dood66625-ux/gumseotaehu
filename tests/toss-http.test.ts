import { describe, expect, it, vi } from "vitest";
import { createTossTestTransport } from "../lib/integrations/toss-http";
import { TossTestContract } from "../lib/integrations/toss";
import type { HttpRequest } from "../lib/integrations/contracts";
const request: HttpRequest = {
  method: "POST",
  path: "/v1/payments/confirm",
  headers: {
    Authorization:
      "Basic " + Buffer.from("test_sk_synthetic:").toString("base64"),
  },
  body: { amount: 33000 },
  timeoutMs: 100,
};
const paid = {
  paymentKey: "synthetic-payment",
  orderId: "synthetic-order",
  totalAmount: 33000,
  status: "DONE",
};
describe("Toss HTTP test transport, all requests intercepted", () => {
  it("fails closed and never sends live credentials or arbitrary endpoints", async () => {
    const send = vi.fn<typeof fetch>();
    await expect(
      createTossTestTransport({ enabled: false, fetch: send })(request),
    ).rejects.toThrow("DISABLED");
    const t = createTossTestTransport({ enabled: true, fetch: send });
    await expect(
      t({
        ...request,
        headers: {
          Authorization:
            "Basic " + Buffer.from("live_sk_fake:").toString("base64"),
        },
      }),
    ).rejects.toThrow("ONLY_TOSS_TEST");
    await expect(t({ ...request, path: "//other.example" })).rejects.toThrow(
      "ENDPOINT",
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("confirms using the fixed host, no redirects and server amount", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(paid));
    const t = new TossTestContract(
      "test_sk_synthetic",
      createTossTestTransport({ enabled: true, fetch: send }),
    );
    expect((await t.confirm(paid.orderId, paid.paymentKey, 33000)).status).toBe(
      "DONE",
    );
    expect(send.mock.calls[0][0]).toBe(
      "https://api.tosspayments.com/v1/payments/confirm",
    );
    expect(send.mock.calls[0][1]?.redirect).toBe("error");
    expect(JSON.parse(send.mock.calls[0][1]?.body as string).amount).toBe(
      33000,
    );
  });
  it("looks up settlement and verifies full cancellation through HTTP", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(paid))
      .mockResolvedValueOnce(
        Response.json({
          ...paid,
          status: "CANCELED",
          cancels: [
            {
              transactionKey: "synthetic-cancel",
              cancelAmount: 33000,
              cancelStatus: "DONE",
            },
          ],
        }),
      );
    const t = new TossTestContract(
      "test_sk_synthetic",
      createTossTestTransport({ enabled: true, fetch: send }),
    );
    expect((await t.lookup(paid.orderId)).status).toBe("DONE");
    expect(
      (await t.cancel(paid.orderId, paid.paymentKey, "테스트 전액 환불"))
        .status,
    ).toBe("CANCELED");
    expect(send.mock.calls[0][1]?.method).toBe("GET");
    expect(send.mock.calls[1][0]).toBe(
      "https://api.tosspayments.com/v1/payments/synthetic-payment/cancel",
    );
    expect(JSON.parse(send.mock.calls[1][1]?.body as string).cancelAmount).toBe(
      33000,
    );
  });
  it.each([401, 429, 500])(
    "redacts provider error bodies for HTTP %i",
    async (status) => {
      const t = createTossTestTransport({
        enabled: true,
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("secret-provider-detail", { status }),
          ),
      });
      await expect(t(request)).rejects.toThrow(
        new Error("TOSS_HTTP_" + status),
      );
    },
  );
  it("rejects malformed responses and masks network errors", async () => {
    await expect(
      createTossTestTransport({
        enabled: true,
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("not-json")),
      })(request),
    ).rejects.toThrow("INVALID_RESPONSE");
    await expect(
      createTossTestTransport({
        enabled: true,
        fetch: vi
          .fn<typeof fetch>()
          .mockRejectedValue(Error("private credential")),
      })(request),
    ).rejects.toThrow(new Error("TOSS_NETWORK_RECONCILIATION_REQUIRED"));
  });
  it("requires reconciliation after timeout without retrying payment", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(Error("aborted")),
            ),
          ),
      );
    await expect(
      createTossTestTransport({ enabled: true, fetch: send })({
        ...request,
        timeoutMs: 5,
      }),
    ).rejects.toThrow("TIMEOUT_RECONCILIATION_REQUIRED");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains server payment verification after successful HTTP", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...paid, totalAmount: 1 }));
    const t = new TossTestContract(
      "test_sk_synthetic",
      createTossTestTransport({ enabled: true, fetch: send }),
    );
    await expect(
      t.confirm(paid.orderId, paid.paymentKey, 33000),
    ).rejects.toThrow("PG_RESPONSE_MISMATCH");
  });
});
