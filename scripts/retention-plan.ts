/** This command opens an existing SQLite database read-only. It never runs DELETE/UPDATE. */
import { DatabaseSync } from "node:sqlite";
import {
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
  constants,
} from "node:fs";
import {
  retentionDecision,
  retentionPolicySchema,
  type RetentionRecord,
} from "../lib/retention-plan";
const [flag, dbPath, policyFlag, policyPath, ...extra] = process.argv.slice(2);
if (!flag && !dbPath) {
  console.log(
    JSON.stringify({
      enabled: false,
      planningOnly: true,
      deletionEnabled: false,
      reason: "Explicit private policy and database paths required",
    }),
  );
} else {
  let database: DatabaseSync | undefined;
  try {
    if (
      flag !== "--db" ||
      !dbPath ||
      policyFlag !== "--policy" ||
      !policyPath ||
      extra.length
    )
      throw Error("USAGE");
    const fd = openSync(policyPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let policy;
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid?.() ||
        stat.mode & 0o077 ||
        stat.nlink !== 1 ||
        stat.size > 1024 * 1024
      )
        throw Error("PRIVATE_POLICY_REQUIRED");
      policy = retentionPolicySchema.parse(
        JSON.parse(readFileSync(fd, "utf8")),
      );
    } finally {
      closeSync(fd);
    }
    database = new DatabaseSync(dbPath, { readOnly: true });
    database.exec("BEGIN");
    const query = database.prepare(
      `SELECT o.id,o.created,o.paid_at AS paidAt,o.payment_status AS payment,(SELECT MAX(resolved) FROM refunds WHERE order_id=o.id) AS refundResolved,(SELECT COUNT(*) FROM tickets WHERE order_id=o.id AND status NOT IN ('closed','resolved')) AS openDisputes,(SELECT COUNT(*) FROM jobs WHERE order_id=o.id AND state NOT IN ('done','canceled')) AS activeWork FROM orders o ORDER BY o.created,o.id`,
    );
    const counts: Record<string, number> = {};
    let total = 0;
    const now = Date.now();
    for (const row of query.iterate()) {
      const decision = retentionDecision(row as RetentionRecord, policy, now);
      counts[decision] = (counts[decision] ?? 0) + 1;
      total++;
    }
    database.exec("COMMIT");
    console.log(
      JSON.stringify({
        planningOnly: true,
        deletionEnabled: false,
        total,
        counts,
      }),
    );
  } catch {
    console.error(
      "RETENTION_PLAN_UNAVAILABLE; private values suppressed; no deletion performed",
    );
    process.exitCode = 1;
  } finally {
    database?.close();
  }
}
