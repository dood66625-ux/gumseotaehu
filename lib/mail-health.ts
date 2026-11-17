/** Aggregate-only inspection: no decryption, provider calls, or queue mutations. */
import type { DatabaseSync } from "node:sqlite";
const states = [
  "local_only",
  "queued",
  "retrying",
  "sending",
  "uncertain",
  "accepted",
  "delivered",
  "bounced",
  "complained",
  "review",
  "blocked",
  "canceled",
] as const;
export function mailQueueHealth(database: DatabaseSync, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0)
    throw Error("INVALID_MAIL_HEALTH_TIME");
  // Keep every read in one snapshot, including when the live worker is writing.
  database.exec("BEGIN");
  try {
    const counts: Record<string, number> = Object.fromEntries(
      states.map((s) => [s, 0]),
    );
    counts.other = 0;
    for (const row of database
      .prepare("SELECT state,COUNT(*) AS n FROM mail_queue GROUP BY state")
      .all()) {
      const state = String(row.state);
      counts[(states as readonly string[]).includes(state) ? state : "other"] +=
        Number(row.n);
    }
    const row = database
      .prepare(
        `SELECT
      COUNT(*) AS total,
      COALESCE(SUM(recovery_hold<>0),0) AS recoveryHeld,
      COALESCE(SUM(state='sending' AND lease_until<=?),0) AS expiredLeases,
      COALESCE(SUM(state IN ('queued','retrying') AND recovery_hold=0 AND scheduled<=? AND lease_until<=? AND updated<=?),0) AS overdueQueue,
      COALESCE(SUM(state='accepted' AND first_dispatched IS NOT NULL AND first_dispatched<=?),0) AS acceptedWithoutDelivery
      FROM mail_queue`,
      )
      .get(now, now, now, now - 15 * 60000, now - 86400000)!;
    const signals = {
      recoveryHeld: Number(row.recoveryHeld),
      expiredLeases: Number(row.expiredLeases),
      overdueQueue: Number(row.overdueQueue),
      acceptedWithoutDelivery: Number(row.acceptedWithoutDelivery),
    };
    const issues: string[] = [];
    if (counts.review) issues.push("MAIL_REVIEW_REQUIRED");
    if (counts.uncertain) issues.push("MAIL_RESULT_UNCERTAIN");
    if (signals.recoveryHeld) issues.push("MAIL_RESTORE_HELD");
    if (signals.expiredLeases) issues.push("MAIL_LEASE_EXPIRED");
    if (signals.overdueQueue) issues.push("MAIL_QUEUE_OVERDUE");
    if (signals.acceptedWithoutDelivery)
      issues.push("MAIL_DELIVERY_UNCONFIRMED");
    if (counts.blocked) issues.push("MAIL_BLOCKED");
    if (counts.other) issues.push("MAIL_STATE_UNRECOGNIZED");
    database.exec("COMMIT");
    return {
      version: 1,
      checkedAt: now,
      total: Number(row.total),
      counts,
      signals,
      issues,
      requiresAttention: issues.length > 0,
      mailSentByCheck: false,
      launchReady: false,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
