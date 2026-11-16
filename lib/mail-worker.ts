/** Candidate scheduler only: not imported by the app worker and disabled by default.
 * Explicit cutover excludes old local/demo mail when a delivery worker is enrolled.
 */
import { all } from "./db";
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
