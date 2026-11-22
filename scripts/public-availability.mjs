/** Fixed public read-only probes; never uses SSH, cookies, API keys or provider requests. */
import { pathToFileURL } from "node:url";
import { parseMerchantBuildInfo } from "./merchant-build-info.mjs";
const targets = [
  {
    id: "review-assets",
    url: "https://gumseo.kr/build-info.json",
    valid(value) {
      return !!parseMerchantBuildInfo(value).revision;
    },
  },
  {
    id: "review-checkout",
    url: "https://pay.gumseo.kr/health",
    valid(value) {
      return (
        value &&
        Object.keys(value).join(",") === "mode" &&
        value.mode === "isolated-toss-test"
      );
    },
  },
];
async function readBounded(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("EMPTY");
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 4096) throw Error("TOO_LARGE");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export async function probePublicAvailability(send = fetch) {
  const checks = await Promise.all(
    targets.map(async (target) => {
      try {
        const response = await send(target.url, {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (response.status !== 200) {
          await response.body?.cancel();
          return { id: target.id, passed: false, code: "HTTP_UNAVAILABLE" };
        }
        if (!target.valid(await readBounded(response))) throw Error("INVALID");
        return { id: target.id, passed: true, code: "OK" };
      } catch {
        return { id: target.id, passed: false, code: "UNAVAILABLE_OR_INVALID" };
      }
    }),
  );
  return {
    scope: "public-review-availability-only",
    healthy: checks.every((check) => check.passed),
    checks,
    privateHostVerified: false,
    backupFreshnessVerified: false,
    customerMailEnabled: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await probePublicAvailability();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.healthy ? 0 : 1;
}
