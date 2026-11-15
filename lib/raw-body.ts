import { Fault } from "./security";
/** Read exact bytes for signature verification. Bound total bytes and total read time. */
export async function readRawBody(
  request: Request,
  maxBytes = 65536,
  timeoutMs = 5000,
) {
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 1048576 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 10000
  )
    throw Error("INVALID_BODY_LIMIT");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new Fault("WEBHOOK_BODY_TOO_LARGE", 413);
  if (!request.body) throw new Fault("WEBHOOK_BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0,
    expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const next = await reader.read();
      if (expired) throw new Fault("WEBHOOK_BODY_TIMEOUT", 408);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Fault("WEBHOOK_BODY_TOO_LARGE", 413);
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
