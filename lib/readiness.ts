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
      "owner-funded-fixed-synthetic-ai-generation-storage-reopen-pdf",
      "async-report-publication-with-lease-and-order-revalidation",
      "durable-job-and-refund-reconciliation",
      "offline-toss-order-integration-and-notification-recovery",
      "disabled-by-default-signed-test-webhook-receipt",
      "offline-mail-queue-idempotency-bounce-and-restore-quarantine",
      "single-operator-session-rotation-and-recent-mfa",
      "owner-confirmed-isolated-test-admin-credential-rotation",
      "owner-verified-private-staging-backup-and-health-timers",
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
          "An owner-operated isolated test server completed test authentication, verified approval, report readiness, MFA-authorized full cancellation and post-refund PDF HTTP 403. Test MID mismatch recovery used independent lookup before rebinding the unique synthetic order. Public synthetic review HTTPS and the real Toss TEST widget/card gateway are verified. Approval on the new public domain, production routes/workers, webhook verification and merchant contract review remain incomplete; live payments remain disabled.",
      },
      {
        id: "ai",
        kind: "implementation-and-provider",
        detail:
          "Owner-funded fixed synthetic generation stored real OpenAI reports and verified unchanged reopens/PDF with zero regeneration. The first known-time draft was under the requested chapter length; v2 enforces 350 characters and a time-unknown sample passed basic gates. One response was rejected by the safety filter. Original three reservations remain, with one explicitly recorded funded-resume slot (four lifetime calls). Professional and normal-time v2 quality review, customer-data authorization, production adapter/worker registration and production spend limits remain incomplete. Rule mock cannot be sold.",
      },
      {
        id: "mail",
        kind: "implementation-and-provider",
        detail:
          "Provider-neutral delivery/retry/bounce core, an unregistered Resend HTTP adapter and aggregate queue inspection are tested offline. The owner supplied the Resend credential, showed a verified sending domain and reported receipt of the separate owner-only test email. Customer OTP/transaction receipt and bounce evidence, provider webhook enrollment, worker cutover/registration and removal of local OTP endpoints remain required; customer mail is disabled.",
      },
      {
        id: "hosting",
        kind: "infrastructure",
        detail:
          "Local runtime artifacts were built into offline Docker images and synthetic purchase/PDF/restart persistence/non-root/read-only/probes passed. GitHub runtime image builds succeeded. The owner verified private iwinv staging, recurring server backups, an encrypted Windows copy, and the first scheduled health check. Public HTTPS for the isolated synthetic review domains is verified. Always-on external alerts, actual-host recovery and operating-service validation remain open; the review site is not a production sales launch.",
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
          "Multi-user role lifecycle, managed MFA enrollment/recovery and production credential rotation remain incomplete; only one local operator is supported.",
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
