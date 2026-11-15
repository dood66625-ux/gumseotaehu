import { privacyCheckpointHealth } from "./privacy-checkpoint";
import { db, all, one, run } from "./db";
export function workerHeartbeat() {
  const now = Date.now();
  run(
    "INSERT INTO worker_heartbeat VALUES('reports',?) ON CONFLICT(name) DO UPDATE SET updated=excluded.updated WHERE updated<?",
    now,
    now - 10000,
  );
}
/** Aggregate operational state; never exposes birth data, emails, tokens or report text. */
export function operationalHealth() {
  const now = Date.now(),
    heartbeat =
      one("SELECT updated FROM worker_heartbeat WHERE name='reports'")
        ?.updated ?? null;
  const counts = {
    mailQueued: one(
      "SELECT count(*) n FROM mail_queue WHERE state IN ('queued','retrying')",
    )!.n as number,
    mailUncertain: one(
      "SELECT count(*) n FROM mail_queue WHERE state IN ('sending','uncertain','review','blocked')",
    )!.n as number,
    mailAccepted: one(
      "SELECT count(*) n FROM mail_queue WHERE state='accepted'",
    )!.n as number,
    mailDelivered: one(
      "SELECT count(*) n FROM mail_queue WHERE state='delivered'",
    )!.n as number,
    mailBounced: one(
      "SELECT count(*) n FROM mail_queue WHERE state IN ('bounced','complained')",
    )!.n as number,
    tossUncertain: one(
      "SELECT count(*) n FROM toss_attempts WHERE state IN ('confirming','uncertain')",
    )!.n as number,
    tossReview: one(
      "SELECT count(*) n FROM toss_attempts WHERE state='review'",
    )!.n as number,
    undeliverablePaid: one(
      "SELECT count(*) n FROM orders WHERE payment_status='paid' AND fulfillment='failed'",
    )!.n as number,
    failedJobs: one("SELECT count(*) n FROM jobs WHERE state='failed'")!
      .n as number,
    refundErrors: one("SELECT count(*) n FROM refunds WHERE status='error'")!
      .n as number,
    overdueTickets: one(
      "SELECT count(*) n FROM tickets WHERE status='open' AND due<?",
      now,
    )!.n as number,
    missingReports: one(
      "SELECT count(*) n FROM orders o WHERE payment_status='paid' AND fulfillment='ready' AND content_deleted=0 AND expires>? AND NOT EXISTS(SELECT 1 FROM reports r WHERE r.order_id=o.id AND r.version=o.version)",
      now,
    )!.n as number,
    pendingApprovals: one(
      "SELECT count(*) n FROM orders o JOIN pg_ledger p ON p.order_id=o.id WHERE o.payment_status='pending' AND p.status='DONE' AND p.amount=o.amount",
    )!.n as number,
  };
  return {
    heartbeat,
    workerHealthy: heartbeat !== null && now - heartbeat < 60000,
    counts,
    privacyCheckpoint: privacyCheckpointHealth(db(), now),
  };
}
/** Missing jobs are recoverable; missing already-delivered reports require backup recovery. */
export function repairMissingJobs() {
  return all(
    "SELECT o.id,o.version FROM orders o WHERE o.payment_status='paid' AND o.content_deleted=0 AND o.expires>? AND o.fulfillment!='ready' AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.order_id=o.id AND j.version=o.version) LIMIT 100",
    Date.now(),
  );
}
