import { existsSync } from "node:fs";
if (existsSync(".env.local") && !process.env.DATA_KEY)
  process.loadEnvFile(".env.local");
export function config() {
  if (
    process.env.APP_MODE !== "local" ||
    process.env.EXTERNAL_EFFECTS !== "disabled"
  )
    throw new Error("EXTERNAL_EFFECTS_BLOCKED: local mock mode only");
  for (const k of [
    "DATA_KEY",
    "AUTH_SECRET",
    "ADMIN_PASSWORD",
    "ADMIN_TOTP_SECRET",
  ])
    if (!process.env[k] || process.env[k]!.length < 32)
      throw new Error("CONFIG_REQUIRED:" + k);
  if (!/^[a-f0-9]{64}$/.test(process.env.DATA_KEY!))
    throw new Error("INVALID_DATA_KEY");
  if (!/^(?:[a-f0-9]{2}){20,64}$/i.test(process.env.ADMIN_TOTP_SECRET!))
    throw Error("INVALID_ADMIN_TOTP_SECRET");
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw Error("INVALID_APP_ORIGIN");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== origin
  )
    throw Error("INVALID_APP_ORIGIN");
  const year = Number(process.env.REPORT_YEAR || 2027);
  if (year !== 2027) throw Error("UNSUPPORTED_PRODUCT_YEAR");
  const db = process.env.DATABASE_PATH || "./var/geumseo.sqlite";
  if (/^[a-z]+:\/\//i.test(db)) throw Error("SQLITE_PATH_REQUIRED");
  return {
    key: Buffer.from(process.env.DATA_KEY!, "hex"),
    secret: process.env.AUTH_SECRET!,
    db,
    origin,
    year,
  };
}
