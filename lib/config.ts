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
  return {
    key: Buffer.from(process.env.DATA_KEY!, "hex"),
    secret: process.env.AUTH_SECRET!,
    db: process.env.DATABASE_PATH || "./var/geumseo.sqlite",
    origin: process.env.APP_ORIGIN || "http://localhost:3000",
    year: Number(process.env.REPORT_YEAR || 2027),
  };
}
