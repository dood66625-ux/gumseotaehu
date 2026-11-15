import { business } from "./business";
/** No credentials are returned and no external provider is contacted. */
export function launchReadiness() {
  return {
    mode: "local-mock",
    launchReady: false,
    externalEffectsEnabled: false,
    completedLocal: [
      "server-price-and-payment-state-checks",
      "portable-local-runtime-and-container-restart-persistence-checks",
      "isolated-synthetic-openai-adapter-with-durable-call-budget",
      "async-report-publication-with-lease-and-order-revalidation",
      "durable-job-and-refund-reconciliation",
      "offline-toss-order-integration-and-notification-recovery",
      "disabled-by-default-signed-test-webhook-receipt",
      "offline-mail-queue-idempotency-bounce-and-restore-quarantine",
      "single-operator-session-rotation-and-recent-mfa",
      "verified-two-address-email-change-mock",
      "encrypted-backup-and-signed-deletion-replay",
      "automatic-local-deletion-checkpoints-with-source-time-validation",
      "offline-data-key-rotation-with-session-revocation",
      "astrology-boundary-guards-and-reference-subset",
    ],
    business: {
      nameProvided: !!business.name,
      registrationProvided: !!business.registrationNumber,
      representativeProvided: !!business.representative,
      addressProvided: !!business.address,
      emailProvided: !!business.email,
      phoneProvided: !!business.phone,
      registryVerified: business.registryVerified,
    },
    blockers: [
      {
        id: "toss",
        kind: "implementation-and-provider",
        detail:
          "DB-backed Toss order/approval/refund and signed raw-body notification receipt are tested offline. The test-only receiver is disabled by default and never calls providers. An isolated fixed-fixture widget/server has reached a real test issuer authentication screen and cancellation; production browser/callback/worker registration, authenticated approval/refund, merchant/security-key/signature verification remain incomplete.",
      },
      {
        id: "ai",
        kind: "implementation-and-provider",
        detail:
          "Fixed-fixture OpenAI HTTP adapter, 3-call persistent test budget and async publication core are implemented. The live synthetic attempt returned HTTP 429; successful AI generation, customer-data authorization, production worker registration, production spend limits and expert quality evaluation remain incomplete. Rule mock cannot be sold.",
      },
      {
        id: "mail",
        kind: "implementation-and-provider",
        detail:
          "Provider-neutral delivery/retry/bounce core is tested offline. Actual mail provider adapter, verified sender domain/SPF/DKIM/DMARC, real authentication and removal of local OTP endpoints remain required.",
      },
      {
        id: "hosting",
        kind: "infrastructure",
        detail:
          "Local runtime artifacts were built into offline Docker images and synthetic purchase/PDF/restart persistence/non-root/read-only/probes passed. Source Docker clean build remains unverified due registry network limits. Private staging, TLS, alerting, offsite backup and actual-host recovery still required.",
      },
      {
        id: "identity",
        kind: "implementation-and-review",
        detail:
          "Adult self-declaration is not verified identity. Minor paid access remains disabled; legal/PG review required.",
      },
      {
        id: "calendar",
        kind: "expert-review",
        detail:
          "Full Korean lunar/calendar/terms and luck-cycle validation remains incomplete beyond reference subsets.",
      },
      {
        id: "privacy",
        kind: "implementation-and-review",
        detail:
          "Approved transaction retention/legal holds, automated backup deletion propagation and managed AUTH_SECRET/credential rotation remain incomplete; offline DATA_KEY rotation is implemented. Local automatic checkpoints validate signature/time/source DB and expose failure/staleness; authoritative offsite latest-copy freshness still needs operator verification.",
      },
      {
        id: "admin",
        kind: "implementation",
        detail:
          "Multi-user role lifecycle, managed MFA enrollment/recovery and credential rotation remain incomplete; only one local operator is supported.",
      },
      {
        id: "traffic",
        kind: "implementation-and-infrastructure",
        detail:
          "Trusted reverse proxy/WAF/distributed limits, advertising consent/attribution and real-user Web Vitals remain incomplete.",
      },
      {
        id: "legal",
        kind: "owner-and-expert",
        detail:
          "Required seller contact/disclosures, applicable registrations, contracts/refund/privacy/AI notices and tax treatment need approval.",
      },
      {
        id: "devices",
        kind: "manual-verification",
        detail:
          "Real iOS/Android/in-app browsers, payment app return and mail/PDF flows require device checks.",
      },
      {
        id: "approval",
        kind: "owner-approval",
        detail:
          "Live payment, real mail, customer-data transfer and public operating deployment each remain unapproved.",
      },
    ],
  } as const;
}
