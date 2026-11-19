import { config } from "./config";
import { runResendMailCycle } from "./resend-mail-worker";
/** Explicit enrollment only. Does not create the signed cutover file. */
export async function runConfiguredMailCycle(fetcher?: typeof fetch) {
  const mode = process.env.MAIL_WORKER_MODE;
  if (!mode || mode === "disabled") return { state: "disabled" as const };
  if (mode !== "resend") throw Error("INVALID_MAIL_WORKER_MODE");
  if (process.env.CUSTOMER_MAIL_APPROVAL !== "customer-mail-approved")
    throw Error("CUSTOMER_MAIL_NOT_APPROVED");
  const cfg = config();
  if (!cfg.origin.startsWith("https://")) throw Error("MAIL_HTTPS_REQUIRED");
  const cutoverFile = process.env.MAIL_CUTOVER_FILE;
  if (!cutoverFile) throw Error("MAIL_CUTOVER_FILE_REQUIRED");
  return runResendMailCycle({
    enabled: true,
    approval: "customer-mail-approved",
    apiKey: process.env.RESEND_API_KEY ?? "",
    accountScope: process.env.RESEND_ACCOUNT_SCOPE ?? "",
    profile: {
      sender: process.env.TRANSACTION_MAIL_SENDER ?? "",
      replyTo: process.env.TRANSACTION_MAIL_REPLY_TO ?? "",
      origin: cfg.origin,
    },
    cutoverFile,
    fetch: fetcher,
  });
}
