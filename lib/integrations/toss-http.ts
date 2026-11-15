import { tossTestSecretKind } from "./toss-key-profile.mjs";
import type { Transport } from "./contracts";

/** Opt-in test API only; deliberately not wired into checkout or runtime config. */
export function createTossTestTransport(options: {
  enabled: boolean;
  fetch?: typeof fetch;
}): Transport {
  const send = options.fetch ?? globalThis.fetch;
  return async (request) => {
    if (!options.enabled) throw Error("TOSS_TEST_TRANSPORT_DISABLED");
    const auth = request.headers.Authorization;
    const credential = auth?.startsWith("Basic ")
      ? Buffer.from(auth.slice(6), "base64").toString("utf8")
      : "";
    if (!credential.endsWith(":")) throw Error("ONLY_TOSS_TEST_KEYS_ALLOWED");
    const kind = tossTestSecretKind(credential.slice(0, -1));
    const orderLookup = /^\/v1\/payments\/orders\/[A-Za-z0-9_%.-]+$/.test(
      request.path,
    );
    if (kind === "widget" && orderLookup)
      throw Error("WIDGET_ORDER_LOOKUP_NOT_SUPPORTED");
    // No configurable host, redirects, query strings, or arbitrary endpoints.
    if (!(
      (request.method === "POST" && request.path === "/v1/payments/confirm") ||
      (request.method === "GET" &&
        (orderLookup ||
          /^\/v1\/payments\/[A-Za-z0-9_%.-]+$/.test(request.path))) ||
      (request.method === "POST" &&
        /^\/v1\/payments\/[A-Za-z0-9_%.-]+\/cancel$/.test(request.path))
    ))
      throw Error("TOSS_ENDPOINT_NOT_ALLOWED");
    if (
      new URL("https://api.tosspayments.com" + request.path).pathname !==
      request.path
    )
      throw Error("TOSS_ENDPOINT_NOT_ALLOWED");
    if (
      !Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 1 ||
      request.timeoutMs > 30000
    )
      throw Error("INVALID_TOSS_TIMEOUT");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await send(
        "https://api.tosspayments.com" + request.path,
        {
          method: request.method,
          headers: request.headers,
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      // Never expose provider bodies, credentials, or personal details in errors.
      if (!response.ok) throw Error("TOSS_HTTP_" + response.status);
      if (!response.body) throw Error("TOSS_INVALID_RESPONSE");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 256 * 1024) {
            await reader.cancel();
            throw Error("TOSS_RESPONSE_TOO_LARGE");
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw Error("TOSS_INVALID_RESPONSE");
      }
    } catch (error) {
      if (controller.signal.aborted)
        throw Error("TOSS_TIMEOUT_RECONCILIATION_REQUIRED");
      if (
        error instanceof Error &&
        /^TOSS_(HTTP_\d{3}|INVALID_RESPONSE|RESPONSE_TOO_LARGE)$/.test(
          error.message,
        )
      )
        throw error;
      throw Error("TOSS_NETWORK_RECONCILIATION_REQUIRED");
    } finally {
      clearTimeout(timer);
    }
  };
}
