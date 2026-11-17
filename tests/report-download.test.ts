import { afterEach, describe, expect, it, vi } from "vitest";
import { reportDownload } from "../lib/report-download";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const pdf = () =>
  new Response("%PDF-1.4\nsynthetic", {
    headers: { "content-type": "application/pdf" },
  });
describe("bounded PDF fetch without automatic retries", () => {
  it("returns PDF bytes without changing or sending a second request", async () => {
    const fetcher = vi.fn(async () => pdf());
    vi.stubGlobal("fetch", fetcher);
    expect(await (await reportDownload("synthetic")).text()).toContain("%PDF-");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects an HTML page disguised as a PDF", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>private upstream failure</html>", {
            headers: { "content-type": "application/pdf" },
          }),
      ),
    );
    await expect(reportDownload("synthetic")).rejects.toThrow(
      "PDF를 가져오지 못했습니다",
    );
  });
  it("rejects non-PDF content type and empty documents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", { headers: { "content-type": "application/pdf" } }),
      ),
    );
    await expect(reportDownload("synthetic")).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("%PDF-1.4", {
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    await expect(reportDownload("synthetic")).rejects.toThrow();
  });
  it("rejects an oversized streamed response even without a content-length header", async () => {
    let canceled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              pull(c) {
                c.enqueue(new Uint8Array(1024 * 1024));
              },
              cancel() {
                canceled = true;
              },
            }),
            { headers: { "content-type": "application/pdf" } },
          ),
      ),
    );
    await expect(reportDownload("synthetic")).rejects.toThrow();
    expect(canceled).toBe(true);
  });
  it("aborts a stalled body, releases the wait and never retries", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      signal = init.signal!;
      return new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "application/pdf" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = reportDownload("synthetic").catch((e) => e);
    await vi.advanceTimersByTimeAsync(20000);
    expect((await result).message).toContain("추가 결제 없이");
    expect(signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps unauthorized and HTML error bodies out of the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("secret upstream body", { status: 401 })),
    );
    await expect(reportDownload("synthetic")).rejects.toThrow(
      "인증이 만료됐습니다",
    );
  });
});
