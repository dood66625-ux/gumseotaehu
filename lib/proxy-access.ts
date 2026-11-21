/** Opt-in authenticated proxy metadata. Forwarded/X-Forwarded-For are never trusted. */
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { Fault, limit } from "./security";
export function canonicalClientIp(value: string | null) {
  if (
    !value ||
    value.length > 64 ||
    value.trim() !== value ||
    value.includes("%") ||
    !isIP(value)
  )
    return null;
  if (isIP(value) === 4) return value;
  const normalized = new URL("http://[" + value + "]/").hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/i.exec(normalized);
  if (mapped) {
    const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
    return [
      Math.floor(n / 16777216),
      Math.floor(n / 65536) % 256,
      Math.floor(n / 256) % 256,
      n % 256,
    ].join(".");
  }
  return normalized;
}
/** Only returns an IP after shared proxy authentication; disabled means no IP inference. */
export function proxyClientIp(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.CLIENT_IP_PROTECTION || env.CLIENT_IP_PROTECTION === "disabled")
    return null;
  if (env.CLIENT_IP_PROTECTION !== "trusted-proxy")
    throw new Fault("접속 보호 설정을 확인해 주세요.", 503);
  const expected = env.TRUSTED_PROXY_TOKEN ?? "",
    supplied = headers.get("x-gumseo-proxy-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(expected))
    throw new Fault("접속 보호 설정을 확인해 주세요.", 503);
  if (
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    throw new Fault("허용된 접속 경로로 다시 접속해 주세요.", 403);
  const ip = canonicalClientIp(headers.get("x-gumseo-client-ip"));
  if (!ip) throw new Fault("접속 정보를 확인하지 못했습니다.", 403);
  return ip;
}
export function protectProxyRequest(
  headers: Headers,
  path: string,
  method: string,
) {
  const ip = proxyClientIp(headers);
  if (!ip) return;
  // limit() HMACs the complete bucket before storage; no raw IP enters the ledger or audit.
  limit("proxy:all:" + ip, 240, 60000);
  if (["auth/request", "auth/verify", "admin/login"].includes(path))
    limit("proxy:auth:" + ip, 15, 60000);
  else if (
    method !== "GET" &&
    (path.startsWith("payments/") || path.startsWith("admin/"))
  )
    limit("proxy:financial:" + ip, 30, 60000);
}
