import { expect, it, vi } from "vitest";
import { mailDomain, checkMailDns, mailSetupStatus } from "../lib/mail-setup";
const plan = {
  domain: "EXAMPLE.INVALID",
  records: [
    {
      type: "TXT",
      name: "resend._domainkey.example.invalid",
      value: "p=public-test-dkim",
    },
    {
      type: "TXT",
      name: "send.example.invalid",
      value: "v=spf1 include:example.invalid ~all",
    },
    {
      type: "MX",
      name: "send.example.invalid",
      value: "mx.example.invalid",
      priority: 10,
    },
    {
      type: "CNAME",
      name: "track.example.invalid",
      value: "alias.example.invalid",
    },
  ],
};
function resolver() {
  return {
    txt: vi.fn(async (name: string) =>
      name.startsWith("resend")
        ? [["p=public-", "test-dkim"]]
        : [["v=spf1 include:example.invalid ~all"]],
    ),
    mx: vi.fn(async () => [{ exchange: "MX.EXAMPLE.INVALID.", priority: 10 }]),
    cname: vi.fn(async () => ["ALIAS.EXAMPLE.INVALID."]),
  };
}
it("matches provider records including split TXT chunks and canonical MX/CNAME names without claiming launch readiness", async () => {
  const result = await checkMailDns(plan, resolver());
  expect(result.dnsMatchesPlan).toBe(true);
  expect(result.launchReady).toBe(false);
  expect(result.providerOwnershipVerified).toBe(false);
  expect(result.mailSent).toBe(false);
});
it("detects conflicting SPF and incorrect MX priority", async () => {
  const r = resolver();
  r.txt.mockResolvedValue([
    ["v=spf1 include:example.invalid ~all"],
    ["v=spf1 -all"],
  ]);
  r.mx.mockResolvedValue([{ exchange: "mx.example.invalid", priority: 20 }]);
  const result = await checkMailDns(plan, r);
  expect(result.checks[1].reason).toBe("MULTIPLE_SPF_RECORDS");
  expect(result.checks[2].matched).toBe(false);
  expect(result.dnsMatchesPlan).toBe(false);
});
it("reports DNS outage without leaking resolver errors", async () => {
  const r = resolver();
  r.txt.mockRejectedValue(Error("private input"));
  const result = await checkMailDns(plan, r);
  expect(JSON.stringify(result)).not.toContain("private input");
  expect(result.dnsMatchesPlan).toBe(false);
});
it.each([
  "https://example.invalid/path",
  "127.0.0.1",
  "localhost",
  "user@example.invalid",
  "example.invalid/",
  "bad..invalid",
])("rejects unsafe domain %s", (value) =>
  expect(() => mailDomain(value)).toThrow(),
);
it("rejects outside-domain records, private key material, missing MX priority and duplicate entries before DNS", async () => {
  const r = resolver();
  for (const records of [
    [{ type: "TXT", name: "other.invalid", value: "public" }],
    [{ type: "TXT", name: "example.invalid", value: "re_" + "x".repeat(32) }],
    [{ type: "MX", name: "example.invalid", value: "mx.example.invalid" }],
    [plan.records[0], plan.records[0]],
  ])
    await expect(
      checkMailDns({ domain: plan.domain, records }, r),
    ).rejects.toThrow();
  expect(r.txt).not.toHaveBeenCalled();
});
it("suppresses secret values and distinguishes configuration from verification", () => {
  const key = "re_" + "private_fixture".repeat(3);
  const result = mailSetupStatus({
    TRANSACTION_MAIL_SENDER: "archive@example.invalid",
    TRANSACTION_MAIL_REPLY_TO: "support@example.invalid",
    APP_ORIGIN: "https://example.invalid",
    RESEND_API_KEY: key,
    RESEND_ACCOUNT_SCOPE: "staging",
  });
  expect(result.senderDomain).toBe("example.invalid");
  expect(result.providerCredentialConfigured).toBe(true);
  expect(result.credentialValidityVerified).toBe(false);
  expect(JSON.stringify(result)).not.toContain(key);
  expect(mailSetupStatus({}).launchReady).toBe(false);
});

it("rejects duplicate selector keys and conflicting DMARC rather than accepting one matching record", async () => {
  const cases = [
    {
      name: "resend._domainkey.example.invalid",
      value: "p=public-test",
      other: "p=other-key",
      reason: "MULTIPLE_DKIM_RECORDS",
    },
    {
      name: "_dmarc.example.invalid",
      value: "v=DMARC1; p=none",
      other: "v=DMARC1; p=reject",
      reason: "MULTIPLE_DMARC_RECORDS",
    },
    {
      name: "send.example.invalid",
      value: "V=SPF1 -all",
      other: "v=spf1 ~all",
      reason: "MULTIPLE_SPF_RECORDS",
    },
  ];
  for (const c of cases) {
    const r = resolver();
    r.txt.mockResolvedValue([[c.value], [c.other]]);
    const result = await checkMailDns(
      {
        domain: "example.invalid",
        records: [{ type: "TXT", name: c.name, value: c.value }],
      },
      r,
    );
    expect(result.dnsMatchesPlan).toBe(false);
    expect(result.checks[0].reason).toBe(c.reason);
  }
});
