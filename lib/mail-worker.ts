/** Scheduler with explicit runtime enrollment; disabled by default.
 * Explicit cutover excludes old local/demo mail when a delivery worker is enrolled.
 */
import { all, one } from "./db";
import { config } from "./config";
import { readMailCutoverFile } from "./mail-cutover";
import type { MailDeliveryCoordinator } from "./mail-delivery";

export async function runMailCycle(
  coordinator: Pick<MailDeliveryCoordinator, "prepare" | "workOnce">,
  options: {
    enabled?: boolean;
    createdAtOrAfter: number;
    prepareLimit?: number;
  },
) {
  if (options.enabled !== true) return { state: "disabled" as const };
  const cutoff = options.createdAtOrAfter;
  const limit = options.prepareLimit ?? 10;
  if (
    !Number.isSafeInteger(cutoff) ||
    cutoff < 0 ||
    cutoff > Date.now() ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 25
  )
    throw Error("INVALID_MAIL_WORKER_CUTOVER_OR_BATCH");
  const rows = all(
    "SELECT q.outbox_id FROM mail_queue q JOIN outbox o ON o.id=q.outbox_id WHERE q.profile_digest IS NULL AND q.state='local_only' AND q.recovery_hold=0 AND o.created>=? ORDER BY o.created,q.outbox_id LIMIT ?",
    cutoff,
    limit,
  );
  for (const row of rows) coordinator.prepare(row.outbox_id);
  return { prepared: rows.length, result: await coordinator.workOnce(cutoff) };
}

/** Signed enrollment entry point; runtime registration remains disabled by default. */
export async function runPersistedMailCycle(
  coordinator: Pick<
    MailDeliveryCoordinator,
    "prepare" | "workOnce" | "profileBinding"
  >,
  options: { enabled?: boolean; cutoverFile: string; prepareLimit?: number },
) {
  if (options.enabled !== true) return { state: "disabled" as const };
  const source = one(
    "SELECT source_id FROM privacy_checkpoint_source WHERE id=1",
  );
  if (!source) throw Error("MAIL_CUTOVER_SOURCE_REQUIRED");
  const policy = readMailCutoverFile(
    options.cutoverFile,
    { sourceId: source.source_id, profileDigest: coordinator.profileBinding },
    config().key,
  );
  return runMailCycle(coordinator, {
    enabled: true,
    createdAtOrAfter: policy.createdAtOrAfter,
    prepareLimit: options.prepareLimit,
  });
}
