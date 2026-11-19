import { Fault } from "./security";
/** A missing worker approval must never reopen the demo OTP bypass. */
export function requireLocalMailAccess() {
  if (
    process.env.MAIL_WORKER_MODE &&
    process.env.MAIL_WORKER_MODE !== "disabled"
  )
    throw new Fault("LOCAL_MAIL_ACCESS_DISABLED", 404);
}
