import { config } from "../lib/config";
import { totp } from "../lib/security";
const cfg = config();
const origin = new URL(cfg.origin);
if (
  origin.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
  (process.env.TOSS_PAYMENT_MODE &&
    process.env.TOSS_PAYMENT_MODE !== "disabled") ||
  process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved"
) {
  console.error(
    "ADMIN_CODE_LOCAL_ONLY; use the enrolled authenticator for an operating host",
  );
  process.exit(1);
}
console.log(
  "Local administrator one-time code:",
  totp(process.env.ADMIN_TOTP_SECRET!),
);
