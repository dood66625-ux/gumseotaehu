import plan from "../docs/launch-progress.json";
import { business } from "./business";
type ChecklistTask = {
  id: string;
  title: string;
  status: string;
  remainingKind?: string;
};
/** No credentials are returned and no external provider is contacted. */
export function launchReadiness() {
  const tasks = plan.majors.flatMap<ChecklistTask>((major) =>
    major.sections.flatMap<ChecklistTask>((section) => section.tasks),
  );
  const completed = tasks.filter((task) => task.status === "done").length;
  const remainingWork = tasks
    .filter((task) => task.status !== "done")
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      kind: task.remainingKind,
    }));
  return {
    scope: "repository-checklist-not-live-runtime",
    checklist: {
      updatedKst: plan.updatedKst,
      completed,
      total: tasks.length,
      remaining: remainingWork.length,
      percent: tasks.length
        ? Math.round((completed / tasks.length) * 1000) / 10
        : 0,
      remainingByKind: {
        development: remainingWork.filter((task) => task.kind === "development")
          .length,
        verification: remainingWork.filter(
          (task) => task.kind === "verification",
        ).length,
        decision: remainingWork.filter((task) => task.kind === "decision")
          .length,
      },
      remainingWork,
      excludedFutureScope: plan.excludedFutureScope,
      productionApprovalInferred: false,
    },
    contractMode: "quick-open-owner-confirmed",
    cardReviewCompletionIsSoleLaunchGate: false,
    mode: "local-mock",
    launchReady: false,
    externalEffectsEnabled: false,
    completedLocal: [
      "server-price-and-payment-state-checks",
      "portable-local-runtime-and-container-restart-persistence-checks",
      "isolated-synthetic-openai-adapter-with-durable-call-budget",
      "owner-funded-fixed-synthetic-ai-generation-storage-reopen-pdf",
      "async-report-publication-with-lease-and-order-revalidation",
      "offline-durable-ai-spend-ledger-and-budgeted-generation",
      "offline-opt-in-per-order-openai-http-storage-and-reopen",
      "admin-review-of-held-ai-reservations-with-retry-block",
      "persistent-mock-ai-queue-isolation-across-restart-and-version-change",
      "offline-ai-worker-startup-policy-hold-budget-and-shutdown-cycle",
      "durable-job-and-refund-reconciliation",
      "offline-toss-order-integration-and-notification-recovery",
      "disabled-by-default-signed-test-webhook-receipt",
      "offline-mail-queue-idempotency-bounce-and-restore-quarantine",
      "single-operator-password-login-and-session-rotation",
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
          "An owner-operated isolated test server completed test authentication, verified approval, report readiness, MFA-authorized full cancellation and post-refund PDF HTTP 403. Test MID mismatch recovery used independent lookup before rebinding the unique synthetic order. Public synthetic review HTTPS and the real Toss TEST widget/card gateway are verified. Production approval/lookup/widget, separately approved full-refund recovery and owner receipt code paths are tested offline. Actual production transaction/refund/receipt and webhook verification, host cutover and merchant contract review remain incomplete; live payments remain disabled.",
      },
      {
        id: "ai",
        kind: "implementation-and-provider",
        detail:
          "Owner-funded fixed synthetic generation stored real OpenAI reports and verified unchanged reopens/PDF with zero regeneration. The first known-time draft was under the requested chapter length; v2 enforces 350 characters and a time-unknown sample passed basic gates. One response was rejected by the safety filter. Original three reservations remain, with one explicitly recorded funded-resume slot (four lifetime calls). Professional and normal-time v3 quality review and customer-data authorization remain required. An opt-in per-order HTTP adapter and spend-ledger pipeline passed offline HTTP/storage/reopen tests; they are unregistered. Persistent queue separation passed offline tests. Production activation/cutover and recovery, approved spend policy and worker registration remain incomplete. Rule mock cannot be sold.",
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
          "Default-off retention erasure, reviewed legal holds, encrypted conditional external deletion sync and offline restore protection are implemented. Legal retention approval, actual external store/host recovery acceptance and production activation remain pending; offsite freshness must be independently verified.",
      },
      {
        id: "admin",
        kind: "implementation",
        detail:
          "Owner-chosen password login, scrypt storage, session rotation and inline password reauthentication are implemented. Actual host acceptance remains separate. Multi-user administration is not an added launch requirement.",
      },
      {
        id: "traffic",
        kind: "implementation-and-infrastructure",
        detail:
          "Authenticated proxy metadata and IP limits passed real local Caddy/app tests. Actual host proxy/WAF, direct-port blocking, NAT/IPv6 and operating load acceptance remain incomplete. Paid advertising and multi-host expansion are excluded future scope, not launch blockers.",
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
