/** Fixed, anonymous, read-only probes for the commercial site. No provider calls. */
import { pathToFileURL } from "node:url";
const targets = [
  {
    id: "commercial-landing",
    url: "https://gumseo.kr/",
    type: "text/html",
    maxBytes: 262144,
    valid: (text) =>
      text.includes("금서태후") &&
      text.includes("내 사주 펼쳐보기") &&
      text.includes('href="/start"') &&
      !text.includes("실제 결제 없음"),
  },
  {
    id: "customer-input",
    url: "https://gumseo.kr/start",
    type: "text/html",
    maxBytes: 262144,
    valid: (text) =>
      text.includes("birth-wizard") && text.includes('id="name"'),
  },
  {
    id: "customer-recovery",
    url: "https://gumseo.kr/recover",
    type: "text/html",
    maxBytes: 262144,
    valid: (text) =>
      text.includes("구매 이메일 인증 후") && text.includes("/_next/static/"),
  },
  {
    id: "customer-styles",
    url: "https://gumseo.kr/site.css",
    type: "text/css",
    maxBytes: 1048576,
    valid: (text) =>
      [".hero-portrait", ".birth-wizard", ".report-reader"].every((marker) =>
        text.includes(marker),
      ),
  },
  {
    id: "private-env-blocked",
    url: "https://gumseo.kr/.env",
    blocked: [403, 404],
  },
  {
    id: "private-git-blocked",
    url: "https://gumseo.kr/.git/config",
    blocked: [403, 404],
  },
  {
    id: "admin-export-protected",
    url: "https://gumseo.kr/api/admin/export",
    blocked: [401, 403, 404],
  },
];
async function readBounded(response, maxBytes) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw Error("TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("EMPTY");
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBytes) throw Error("TOO_LARGE");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
}
export async function probePublicAvailability(send = fetch) {
  const checks = await Promise.all(
    targets.map(async (target) => {
      try {
        const response = await send(target.url, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const status = response.status;
        if (target.blocked) {
          // Never inspect a protected response, including accidentally public data.
          await response.body?.cancel();
          return {
            id: target.id,
            passed: target.blocked.includes(status),
            code: target.blocked.includes(status)
              ? "OK"
              : "PROTECTION_CHECK_FAILED",
            httpStatus: status,
          };
        }
        if (status !== 200) {
          await response.body?.cancel();
          return {
            id: target.id,
            passed: false,
            code: "HTTP_UNAVAILABLE",
            httpStatus: status,
          };
        }
        if (
          !response.headers
            .get("content-type")
            ?.toLowerCase()
            .startsWith(target.type)
        ) {
          await response.body?.cancel();
          return {
            id: target.id,
            passed: false,
            code: "CONTENT_TYPE_INVALID",
            httpStatus: status,
          };
        }
        if (
          response.headers.get("x-content-type-options")?.toLowerCase() !==
            "nosniff" ||
          !/\bmax-age=[1-9][0-9]*/i.test(
            response.headers.get("strict-transport-security") ?? "",
          )
        ) {
          await response.body?.cancel();
          return {
            id: target.id,
            passed: false,
            code: "SECURITY_HEADER_MISSING",
            httpStatus: status,
          };
        }
        if (!target.valid(await readBounded(response, target.maxBytes)))
          throw Error("INVALID");
        return { id: target.id, passed: true, code: "OK", httpStatus: status };
      } catch {
        return { id: target.id, passed: false, code: "UNAVAILABLE_OR_INVALID" };
      }
    }),
  );
  return {
    scope: "public-commercial-surface-availability-only",
    healthy: checks.every((c) => c.passed),
    checks,
    privateHostVerified: false,
    backupFreshnessVerified: false,
    providerOperationsVerified: false,
    alertDeliveryVerified: false,
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
