import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../lib/client-api";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("browser API deadlines without automatic mutation retries", () => {
  it("stops a hung read, aborts its signal and releases the timer", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const fetcher = vi.fn((_url: unknown, init: RequestInit) => {
      signal = init.signal!;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetcher);
    const result = api("orders").catch((e) => e);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await result).toBeInstanceOf(ApiError);
    expect((await result).status).toBe(0);
    expect(signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("never posts a mutation when session preparation fails", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("<html>gateway unavailable</html>", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      api("tickets", { message: "synthetic" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("late session completion cannot dispatch the POST after timeout even if transport ignores abort", async () => {
    vi.useFakeTimers();
    let finish: (r: Response) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = api("payments/confirm", { orderId: "synthetic" }).catch(
      (e) => e,
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect((await result).message).toContain("결제·접수 내역");
    finish(Response.json({ ok: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("lost mutation acknowledgement is uncertain and never retried", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const result = api("tickets", { message: "synthetic" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(20000);
    expect((await result).message).toContain("다시 요청하기 전에");
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves HTTP authentication status when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("unauthorized proxy page", { status: 401 }),
      ),
    );
    await expect(api("orders")).rejects.toMatchObject({ status: 401 });
  });
  it("covers a stalled response body, not only initial headers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: () => new Promise(() => {}),
      })),
    );
    const result = api("orders").catch((e) => e);
    await vi.advanceTimersByTimeAsync(20000);
    expect((await result).status).toBe(0);
  });
  it("returns successful data and clears its deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api("tickets", { message: "synthetic" })).resolves.toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("hides internal customer error codes while preserving status and protected admin diagnostics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: "GENERATION_UNAVAILABLE" }, { status: 503 }),
    ),
  );
  await expect(api("orders/synthetic")).rejects.toMatchObject({
    status: 503,
    message: "요청을 처리하지 못했습니다. 잠시 후 다시 확인해주세요.",
  });
  await expect(api("admin/orders")).rejects.toMatchObject({
    status: 503,
    message: "GENERATION_UNAVAILABLE",
  });
});
