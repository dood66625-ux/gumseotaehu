/** Approval recorded in conversation: one invented known-time case, existing key, USD0.10 estimate cap. */
import {
  existsSync,
  mkdirSync,
  chmodSync,
  lstatSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  runApprovedKnownReview,
  reviewApproval,
  extendedReviewApproval,
} from "../lib/approved-synthetic-review";
import { config } from "../lib/config";
import { reportPdf } from "../lib/pdf";
import { reportBook } from "../lib/report-book";
import type { getReport } from "../lib/service";
const flag = process.argv.slice(2).join(" ");
if (
  !["--live-approved-20261122", "--live-approved-20261122-extended"].includes(
    flag,
  )
) {
  console.error("APPROVED_REVIEW_FLAG_REQUIRED; no API call performed");
  process.exit(1);
}
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
let db: DatabaseSync | undefined;
try {
  const c = config(),
    key = process.env.OPENAI_API_KEY;
  if (!key) throw Error("AI_CREDENTIAL_REQUIRED");
  const extended = flag === "--live-approved-20261122-extended";
  const approval = extended ? extendedReviewApproval : reviewApproval;
  const root = resolve(
    extended
      ? "var/approved-korean-review-20261122-extended"
      : "var/approved-korean-review-20261122",
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root)
    throw Error("PRIVATE_REVIEW_DIRECTORY_REQUIRED");
  chmodSync(root, 0o700);
  const path = join(root, "one-call.sqlite");
  if (
    existsSync(path) &&
    (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
  )
    throw Error("PRIVATE_REVIEW_DATABASE_REQUIRED");
  db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
  const result = await runApprovedKnownReview(
      db,
      c.key,
      key,
      fetch,
      extended ? "extended" : "original",
    ),
    report = result.report,
    created = Date.now();
  const pdf = await reportPdf({
    report,
    name: "가상검증",
    created,
    order: {
      id: approval.orderId,
      version: 1,
      expires: created + 86400000,
    },
  } as ReturnType<typeof getReport>);
  writeFileSync(join(root, "known-v3.pdf"), pdf, { mode: 0o600 });
  const evidence = {
    approvalId: approval.id,
    syntheticOnly: true,
    requestProfile: extended ? "synthetic-review-v1" : "standard",
    fixture: "known",
    provider: report.provider,
    promptVersion: report.promptVersion,
    model: report.generation?.model,
    newCalls: result.newCalls,
    totalApprovedCalls: result.budget.calls,
    budgetUsdMicros: 100000,
    maximumEstimatedUsdMicros: result.maximumEstimatedUsdMicros,
    estimatedActualUsdMicros: report.usage.estimatedUsdMicros,
    pricingBasis: "configured conservative list price; not a verified invoice",
    chapters: report.chapters.length,
    chapterCharacters: report.chapters.map((ch) => ch.text.length),
    notesPreserved: report.chart.notes.every((note) =>
      report.notes.includes(note),
    ),
    reportDigest: createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex"),
    takeaways: reportBook(report).chapters.map((ch) => ch.takeaway),
    pdfBytes: pdf.length,
    livePayments: false,
    realMail: false,
    customerDataTransmitted: false,
    professionalQualityApproved: false,
  };
  writeFileSync(
    join(root, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} catch (error) {
  const value = error as { code?: string; message?: string };
  const code =
    [value.code, value.message].find(
      (v) => v && /^[A-Z][A-Z0-9_]{2,80}$/.test(v),
    ) ?? "APPROVED_REVIEW_FAILED";
  console.error(
    JSON.stringify({
      success: false,
      code,
      automaticRetry: false,
      extraCallsNotAuthorized: true,
    }),
  );
  process.exitCode = 1;
} finally {
  db?.close();
}
