/** Public HTTPS read only. Does not verify private app, worker, DB, or host monitor. */
import { parseMerchantBuildInfo } from "./merchant-build-info.mjs";
const args = process.argv.slice(2);
let unavailableCode = "REVIEW_BUILD_UNAVAILABLE";
try {
  if (
    args.length !== 0 &&
    !(
      args.length === 2 &&
      args[0] === "--expect" &&
      /^[a-f0-9]{40}$/.test(args[1])
    )
  )
    throw Error("USAGE");
  const response = await fetch("https://gumseo.kr/build-info.json", {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    unavailableCode = "REVIEW_BUILD_HTTP_" + response.status;
    throw Error("NOT_AVAILABLE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("NOT_AVAILABLE");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw Error("TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const info = parseMerchantBuildInfo(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  const expected = args[1] ?? null,
    matchesExpected = expected ? info.revision === expected : null;
  console.log(
    JSON.stringify(
      {
        scope: info.scope,
        deployedAssetsRevision: info.revision,
        expectedRevision: expected,
        matchesExpected,
        privateAppCommitVerified: false,
      },
      null,
      2,
    ),
  );
  if (info.revision === null || matchesExpected === false) process.exitCode = 2;
} catch {
  console.error(
    unavailableCode +
      ": public asset version is not verified. Values suppressed; private app status unknown.",
  );
  process.exitCode = 1;
}
