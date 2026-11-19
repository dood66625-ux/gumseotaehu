/** Default-disabled scheduler. Runtime enrollment is checked by ai-worker-runtime. */
import type { DatabaseSync } from "node:sqlite";
import type { AiSpendPolicy } from "./ai-spend-ledger";
export function inspectAiWorkerQueue(
  db: DatabaseSync,
  policy: AiSpendPolicy,
  limit = 1,
  createdAtOrAfter = 0,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10)
    throw Error("AI_WORKER_BATCH_INVALID");
  if (
    !Number.isSafeInteger(createdAtOrAfter) ||
    createdAtOrAfter < 0 ||
    createdAtOrAfter > Date.now()
  )
    throw Error("AI_WORKER_CUTOFF_INVALID");
  for (const name of [
    "orders",
    "jobs",
    "order_generation_lanes",
    "ai_spend_calls",
    "ai_spend_policy",
  ])
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(name)
    )
      return {
        state: "blocked" as const,
        reason: "AI_WORKER_DATABASE_NOT_PREPARED" as const,
      };
  const stored = db
    .prepare(
      "SELECT daily,lifetime,reservation FROM ai_spend_policy WHERE id=1",
    )
    .get();
  if (
    !stored ||
    stored.daily !== policy.dailyUsdMicros ||
    stored.lifetime !== policy.lifetimeUsdMicros ||
    stored.reservation !== policy.reservationUsdMicros
  )
    return {
      state: "blocked" as const,
      reason: "AI_WORKER_POLICY_MISMATCH" as const,
    };
  const now = Date.now();
  const eligible = db
    .prepare(
      `SELECT j.order_id orderId FROM jobs j JOIN orders o ON o.id=j.order_id
    JOIN order_generation_lanes l ON l.order_id=o.id AND l.provider='openai'
    WHERE o.payment_status='paid' AND o.content_deleted=0 AND o.expires>? AND j.version=o.version
    AND ((j.state IN ('queued','retrying') AND j.scheduled<=?) OR (j.state='running' AND j.lease_until<?))
    AND o.created>=?
    AND NOT EXISTS(SELECT 1 FROM ai_spend_calls c WHERE c.order_id=o.id AND c.version=j.version)
    ORDER BY j.scheduled,j.id LIMIT ?`,
    )
    .all(now, now, now, createdAtOrAfter, limit) as { orderId: string }[];
  const held = Number(
    db
      .prepare(
        `SELECT count(*) n FROM jobs j JOIN orders o ON o.id=j.order_id
    JOIN order_generation_lanes l ON l.order_id=o.id AND l.provider='openai'
    JOIN ai_spend_calls c ON c.order_id=o.id AND c.version=j.version
    WHERE o.payment_status='paid' AND o.content_deleted=0 AND o.expires>? AND j.version=o.version AND j.state!='done'`,
      )
      .get(now)!.n,
  );
  const totals = db
    .prepare(
      "SELECT COALESCE(sum(max(reserved,COALESCE(actual,0))),0) lifetime,COALESCE(sum(CASE WHEN day=? THEN max(reserved,COALESCE(actual,0)) ELSE 0 END),0) daily FROM ai_spend_calls",
    )
    .get(new Date(now).toISOString().slice(0, 10))!;
  if (
    eligible.length &&
    (Number(totals.daily) + policy.reservationUsdMicros >
      policy.dailyUsdMicros ||
      Number(totals.lifetime) + policy.reservationUsdMicros >
        policy.lifetimeUsdMicros)
  )
    return {
      state: "blocked" as const,
      reason: "AI_WORKER_BUDGET_EXHAUSTED" as const,
      held,
    };
  return { state: "ready" as const, eligible, held };
}
export async function runAiWorkerCycle(
  db: DatabaseSync,
  options: {
    enabled?: boolean;
    policy: AiSpendPolicy;
    runJob: (orderId: string) => Promise<boolean>;
    limit?: number;
    createdAtOrAfter?: number;
    stopping?: () => boolean;
  },
) {
  if (options.enabled !== true)
    return { state: "disabled" as const, processed: 0 };
  if (db.isTransaction) throw Error("AI_WORKER_TOP_LEVEL_REQUIRED");
  const limit = options.limit ?? 1;
  let queue = inspectAiWorkerQueue(
    db,
    options.policy,
    limit,
    options.createdAtOrAfter,
  );
  if (queue.state === "blocked") return { ...queue, processed: 0 };
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    // Refresh after every job: another worker, refund, or higher actual cost can change eligibility.
    queue = inspectAiWorkerQueue(
      db,
      options.policy,
      1,
      options.createdAtOrAfter,
    );
    if (queue.state === "blocked") return { ...queue, processed };
    if (options.stopping?.() || !queue.eligible.length) break;
    if (!(await options.runJob(queue.eligible[0].orderId))) break;
    processed++;
  }
  queue = inspectAiWorkerQueue(db, options.policy, 1, options.createdAtOrAfter);
  return queue.state === "blocked"
    ? { ...queue, processed }
    : { state: "ready" as const, processed, held: queue.held };
}
