import { Fault } from "./security";
/** Enforce the bound while reading, even when Content-Length is absent or false. */
export async function readJsonObject(
  request: Request,
  maxBytes = 16384,
): Promise<Record<string, any>> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new Fault("요청이 너무 큽니다.", 413);
  if (!request.body) throw new Fault("JSON 요청 본문이 필요합니다.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Fault("요청이 너무 큽니다.", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Fault("올바른 JSON이 아닙니다.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Fault("JSON 객체가 필요합니다.");
  return value as Record<string, unknown>;
}
