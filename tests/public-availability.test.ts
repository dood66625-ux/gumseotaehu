import { expect, it, vi } from "vitest";
import { probePublicAvailability } from "../scripts/public-availability.mjs";
const build = {
  version: 1,
  scope: "public-synthetic-review-assets",
  revision: "a".repeat(40),
};
const healthy = (url: string) =>
  Response.json(
    url.includes("build-info") ? build : { mode: "isolated-toss-test" },
  );
it("only reads fixed HTTPS targets with no auth and does not claim private host or backup health", async () => {
  const send = vi.fn(async (url: string) => healthy(url)),
    result = await probePublicAvailability(send as typeof fetch);
  expect(result).toMatchObject({
    healthy: true,
    privateHostVerified: false,
    backupFreshnessVerified: false,
    customerMailEnabled: false,
  });
  expect(send.mock.calls.map((call) => call[0])).toEqual([
    "https://gumseo.kr/build-info.json",
    "https://pay.gumseo.kr/health",
  ]);
  for (const call of send.mock.calls as unknown as [string, RequestInit][])
    expect(call[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
});
it.each(["http", "wrong-body", "oversize", "exception", "null-revision"])(
  "fails closed for %s without leaking raw responses",
  async (mode) => {
    const send = vi.fn(async (url: string) => {
      if (!url.includes("build-info")) return healthy(url);
      if (mode === "http")
        return new Response("private upstream detail", { status: 503 });
      if (mode === "oversize")
        return new Response("private upstream detail".repeat(1000));
      if (mode === "exception") throw Error("private exception detail");
      return Response.json(
        mode === "null-revision"
          ? { ...build, revision: null }
          : { secret: "private upstream detail" },
      );
    });
    const result = await probePublicAvailability(send as typeof fetch);
    expect(result.healthy).toBe(false);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[1].passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
    expect(JSON.stringify(result)).not.toContain("exception detail");
  },
);
