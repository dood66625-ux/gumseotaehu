/** Explicit future opt-in. No route or normal worker imports this registration candidate. */
import { config } from "./config";
import { MailDeliveryCoordinator } from "./mail-delivery";
import type { MailProfile } from "./mail-content";
import { createResendMailGateway } from "./integrations/resend-mail";
import { runPersistedMailCycle } from "./mail-worker";
export async function runResendMailCycle(options: {
  enabled?: boolean;
  approval?: "customer-mail-approved";
  apiKey: string;
  accountScope: string;
  profile: MailProfile;
  cutoverFile: string;
  prepareLimit?: number;
  fetch?: typeof fetch;
}) {
  if (options.enabled !== true) return { state: "disabled" as const };
  if (options.approval !== "customer-mail-approved")
    throw Error("CUSTOMER_MAIL_NOT_APPROVED");
  if (options.profile.origin !== config().origin)
    throw Error("MAIL_APP_ORIGIN_MISMATCH");
  const gateway = createResendMailGateway({
    enabled: true,
    apiKey: options.apiKey,
    accountScope: options.accountScope,
    fetch: options.fetch,
  });
  const coordinator = new MailDeliveryCoordinator(options.profile, gateway);
  return runPersistedMailCycle(coordinator, {
    enabled: true,
    cutoverFile: options.cutoverFile,
    prepareLimit: options.prepareLimit,
  });
}
