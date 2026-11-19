import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { aiSpendLedger, type AiSpendPolicy } from "./ai-spend-ledger";
import { createAiCutoverFile, readAiCutoverFile } from "./ai-cutover";
import { aiPricing, approvedOpenAiModel } from "./integrations/openai-http";
export function aiPolicyDigest(policy: AiSpendPolicy, origin: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "gumseo-ai-enrollment-v1",
        origin,
        approvedOpenAiModel,
        aiPricing.version,
        policy.dailyUsdMicros,
        policy.lifetimeUsdMicros,
        policy.reservationUsdMicros,
      ]),
    )
    .digest("hex");
}
function enrollment(db: DatabaseSync) {
  if (
    !db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_worker_enrollment'",
      )
      .get()
  )
    throw Error("AI_WORKER_NOT_ENROLLED");
  const row = db.prepare("SELECT * FROM ai_worker_enrollment WHERE id=1").get();
  if (!row) throw Error("AI_WORKER_NOT_ENROLLED");
  if (row.recovery_hold !== 0)
    throw Error("AI_RESTORE_RECONCILIATION_REQUIRED");
  return row;
}
/** Explicit offline preparation. No provider calls or historical order reassignment. */
export function enrollAiWorker(
  db: DatabaseSync,
  options: {
    policy: AiSpendPolicy;
    origin: string;
    file: string;
    key: Buffer;
    approval?: "customer-data-approved";
    now?: number;
  },
) {
  if (options.approval !== "customer-data-approved")
    throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
  if (!options.origin.startsWith("https://")) throw Error("AI_HTTPS_REQUIRED");
  if (db.isTransaction) throw Error("AI_WORKER_TOP_LEVEL_REQUIRED");
  if (
    !db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='privacy_checkpoint_source'",
      )
      .get()
  )
    throw Error("AI_CUTOVER_SOURCE_REQUIRED");
  const source = db
    .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
    .get();
  if (!source) throw Error("AI_CUTOVER_SOURCE_REQUIRED");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS ai_worker_enrollment(id INTEGER PRIMARY KEY CHECK(id=1),source_id TEXT NOT NULL,policy_digest TEXT NOT NULL,cutoff INTEGER NOT NULL,recovery_hold INTEGER NOT NULL DEFAULT 0 CHECK(recovery_hold IN (0,1)))",
    );
    if (db.prepare("SELECT 1 FROM ai_worker_enrollment WHERE id=1").get())
      throw Error("AI_WORKER_ALREADY_ENROLLED");
    aiSpendLedger(db, options.policy);
    const policyDigest = aiPolicyDigest(options.policy, options.origin);
    const record = createAiCutoverFile(
      options.file,
      { sourceId: String(source.source_id), policyDigest },
      options.key,
      options.now,
    );
    db.prepare("INSERT INTO ai_worker_enrollment VALUES(1,?,?,?,0)").run(
      source.source_id,
      policyDigest,
      record.createdAtOrAfter,
    );
    db.exec("COMMIT");
    return {
      createdAtOrAfter: record.createdAtOrAfter,
      generationEnabledByCreation: false,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
/** Read-only gate. Missing schema, restored DB or altered bindings never auto-enroll. */
export function readAiWorkerEnrollment(
  db: DatabaseSync,
  options: {
    policy: AiSpendPolicy;
    origin: string;
    file: string;
    key: Buffer;
  },
) {
  const row = enrollment(db);
  const source = db
    .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
    .get();
  const policyDigest = aiPolicyDigest(options.policy, options.origin);
  if (
    !source ||
    source.source_id !== row.source_id ||
    row.policy_digest !== policyDigest
  )
    throw Error("AI_ENROLLMENT_BINDING_MISMATCH");
  const record = readAiCutoverFile(
    options.file,
    { sourceId: String(source.source_id), policyDigest },
    options.key,
  );
  if (record.createdAtOrAfter !== row.cutoff)
    throw Error("AI_ENROLLMENT_CUTOFF_MISMATCH");
  return record;
}
