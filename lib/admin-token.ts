/** Administrator-only session signatures bind a cookie to the current password and MFA seed. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";
function signature(nonce: string) {
  const cfg = config();
  return createHmac("sha256", cfg.secret)
    .update(
      JSON.stringify([
        "gumseo-admin-session-v1",
        nonce,
        cfg.origin,
        process.env.ADMIN_PASSWORD,
        process.env.ADMIN_TOTP_SECRET,
      ]),
    )
    .digest("base64url");
}
export function newAdminToken() {
  const nonce = randomBytes(32).toString("base64url");
  return "ad1." + nonce + "." + signature(nonce);
}
export function validAdminToken(token: string) {
  if (!/^ad1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [, nonce, mac] = token.split(".");
  return timingSafeEqual(Buffer.from(mac), Buffer.from(signature(nonce)));
}
