import { expect, it } from "vitest";
import { updateStatus } from "../scripts/update-status.mjs";

const revision = "a".repeat(40);
const metadata = {
  version: 1,
  scope: "public-synthetic-review-assets",
  revision,
};
const ready = { service: "gumseo-update-notify", version: 1 };
const fetcher =
  (status: number, body: unknown) => async (url: string | URL | Request) =>
    String(url).endsWith("build-info.json")
      ? Response.json(metadata)
      : Response.json(body, { status });

it("separates deployed assets from a missing notification installation and gives the installation step", async () => {
  const result = await updateStatus(fetcher(404, {}));
  expect(result.deployedAssetsRevision).toBe(revision);
  expect(result.notificationReceiver).toBe("not-installed");
  expect(result.nextStep).toContain("enable-auto-updates.sh");
});

it("does not mistake public readiness for authenticated delivery, host health, or the fallback timer", async () => {
  expect(await updateStatus(fetcher(200, ready))).toMatchObject({
    notificationReceiver: "ready",
    authenticatedDeliveryVerified: false,
    privateAppHealthVerified: false,
    timerVerified: false,
  });
});

it("keeps transient errors and foreign pages distinct from an absent installation", async () => {
  for (const [status, body] of [
    [503, {}],
    [200, {}],
  ] as const)
    expect(
      (await updateStatus(fetcher(status, body))).notificationReceiver,
    ).toBe("unverified");
  expect(
    await updateStatus(async () => {
      throw Error("private-network-details");
    }),
  ).toMatchObject({
    deployedAssetsRevision: null,
    notificationReceiver: "unverified",
  });
});
