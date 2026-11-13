import { config } from "../lib/config";
import { totp } from "../lib/security";
config();
console.log(
  "Local administrator one-time code:",
  totp(process.env.ADMIN_TOTP_SECRET!),
);
