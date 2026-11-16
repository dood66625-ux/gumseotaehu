/** Read-only DNS setup checks. DNS visibility is not provider verification or permission to send. */
import { domainToASCII } from "node:url";
import { z } from "zod";
export function mailDomain(input: string) {
  if (/[\/\\:@?#\s]/u.test(input)) throw Error("MAIL_DOMAIN_REQUIRED");
  const value = domainToASCII(input.toLowerCase().replace(/\.$/, ""));
  if (
    value.length > 253 ||
    !value.includes(".") ||
    !value
      .split(".")
      .every((s) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) ||
    /^\d+(?:\.\d+){3}$/.test(value)
  )
    throw Error("MAIL_DOMAIN_REQUIRED");
  return value;
}
const record = z
  .object({
    type: z.enum(["TXT", "MX", "CNAME"]),
    name: z.string().max(253),
    value: z.string().min(1).max(4096),
    priority: z.number().int().min(0).max(65535).optional(),
  })
  .strict();
export const mailDnsPlan = z
  .object({ domain: z.string(), records: z.array(record).min(1).max(12) })
  .strict()
  .transform((plan) => {
    const domain = mailDomain(plan.domain);
    const records = plan.records.map((r) => {
      const name = r.name.toLowerCase().replace(/\.$/, "");
      if (name !== domain && !name.endsWith("." + domain))
        throw Error("DNS_NAME_OUTSIDE_DOMAIN");
      if (!name.split(".").every((s) => /^[a-z0-9_][a-z0-9_-]{0,62}$/.test(s)))
        throw Error("INVALID_DNS_NAME");
      if (
        /[\r\n]/.test(r.value) ||
        /-----BEGIN .*PRIVATE KEY-----/.test(r.value) ||
        /^(?:re_|sk-|whsec_)[A-Za-z0-9_+/=-]{16,}$/.test(r.value)
      )
        throw Error("PRIVATE_OR_INVALID_DNS_VALUE");
      if ((r.type === "MX") !== (r.priority !== undefined))
        throw Error("DNS_PRIORITY_MISMATCH");
      return { ...r, name };
    });
    if (
      new Set(
        records.map(
          (r) => r.type + ":" + r.name + ":" + r.value + ":" + r.priority,
        ),
      ).size !== records.length
    )
      throw Error("DUPLICATE_DNS_RECORD");
    return { domain, records };
  });
export type MailDnsPlan = z.infer<typeof mailDnsPlan>;
export type MailDnsResolver = {
  txt(name: string): Promise<string[][]>;
  mx(name: string): Promise<{ exchange: string; priority: number }[]>;
  cname(name: string): Promise<string[]>;
};
const hostname = (s: string) => s.toLowerCase().replace(/\.$/, "");
export async function checkMailDns(input: unknown, resolver: MailDnsResolver) {
  const plan = mailDnsPlan.parse(input);
  const checks = await Promise.all(
    plan.records.map(async (r) => {
      try {
        let matched = false,
          conflict = false;
        if (r.type === "TXT") {
          const values = (await resolver.txt(r.name)).map((parts) =>
            parts.join(""),
          );
          conflict =
            r.value.startsWith("v=spf1") &&
            values.filter((v) => /^v=spf1(?:\s|$)/i.test(v)).length > 1;
          matched = values.includes(r.value) && !conflict;
        } else if (r.type === "MX")
          matched = (await resolver.mx(r.name)).some(
            (v) =>
              hostname(v.exchange) === hostname(r.value) &&
              v.priority === r.priority,
          );
        else
          matched = (await resolver.cname(r.name)).some(
            (v) => hostname(v) === hostname(r.value),
          );
        return {
          type: r.type,
          name: r.name,
          matched,
          reason: conflict
            ? "MULTIPLE_SPF_RECORDS"
            : matched
              ? "MATCHED"
              : "NOT_MATCHED",
        };
      } catch {
        return {
          type: r.type,
          name: r.name,
          matched: false,
          reason: "DNS_LOOKUP_UNAVAILABLE",
        };
      }
    }),
  );
  return {
    domain: plan.domain,
    dnsMatchesPlan: checks.every((c) => c.matched),
    checks,
    providerOwnershipVerified: false,
    mailSent: false,
    launchReady: false,
  };
}
export function mailSetupStatus(env: Record<string, string | undefined>) {
  let senderDomain: string | null = null;
  try {
    const sender = z.string().email().parse(env.TRANSACTION_MAIL_SENDER);
    senderDomain = mailDomain(sender.split("@")[1]);
  } catch {
    /* report presence only */
  }
  let origin = false;
  try {
    const u = new URL(env.APP_ORIGIN ?? "");
    origin =
      u.protocol === "https:" &&
      u.origin === env.APP_ORIGIN &&
      !u.username &&
      !u.password;
  } catch {
    /* no values in errors */
  }
  return {
    senderDomain,
    senderConfigured: !!senderDomain,
    replyToConfigured: z
      .string()
      .email()
      .safeParse(env.TRANSACTION_MAIL_REPLY_TO).success,
    httpsOriginConfigured: origin,
    providerCredentialConfigured: /^re_[A-Za-z0-9_-]{8,256}$/.test(
      env.RESEND_API_KEY ?? "",
    ),
    accountScopeConfigured: /^[A-Za-z0-9_-]{1,48}$/.test(
      env.RESEND_ACCOUNT_SCOPE ?? "",
    ),
    webhookSecretConfigured: (() => {
      const s = env.RESEND_WEBHOOK_SECRET ?? "";
      if (!s.startsWith("whsec_")) return false;
      const b = Buffer.from(s.slice(6), "base64");
      return b.length === 32 && b.toString("base64") === s.slice(6);
    })(),
    credentialValidityVerified: false,
    providerOwnershipVerified: false,
    mailSent: false,
    launchReady: false,
  };
}
