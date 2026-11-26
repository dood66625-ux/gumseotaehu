/** Inactive integration candidate. No HTTP or worker registration. Amounts are USD micros. */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
export type AiSpendPolicy = {
  dailyUsdMicros: number;
  lifetimeUsdMicros: number;
  reservationUsdMicros: number;
};
export function aiSpendLedger(
  db: DatabaseSync,
  requestedPolicy: AiSpendPolicy,
) {
  const policy = Object.freeze({
    dailyUsdMicros: requestedPolicy.dailyUsdMicros,
    lifetimeUsdMicros: requestedPolicy.lifetimeUsdMicros,
    reservationUsdMicros: requestedPolicy.reservationUsdMicros,
  });
  for (const amount of Object.values(policy))
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw Error("AI_INVALID_SPEND_POLICY");
  if (
    policy.reservationUsdMicros < 60000 ||
    policy.dailyUsdMicros > policy.lifetimeUsdMicros ||
    policy.reservationUsdMicros > policy.dailyUsdMicros
  )
    throw Error("AI_INVALID_SPEND_POLICY");
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS ai_spend_policy(id INTEGER PRIMARY KEY CHECK(id=1),daily INTEGER NOT NULL,lifetime INTEGER NOT NULL,reservation INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_spend_calls(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,version INTEGER NOT NULL,day TEXT NOT NULL,reserved INTEGER NOT NULL,actual INTEGER,state TEXT NOT NULL CHECK(state IN ('reserved','completed','uncertain')),created INTEGER NOT NULL,UNIQUE(order_id,version));
    CREATE INDEX IF NOT EXISTS ai_spend_day ON ai_spend_calls(day);`);
  db.prepare("INSERT OR IGNORE INTO ai_spend_policy VALUES(1,?,?,?)").run(
    policy.dailyUsdMicros,
    policy.lifetimeUsdMicros,
    policy.reservationUsdMicros,
  );
  const stored = db.prepare("SELECT * FROM ai_spend_policy WHERE id=1").get()!;
  if (
    stored.daily !== policy.dailyUsdMicros ||
    stored.lifetime !== policy.lifetimeUsdMicros ||
    stored.reservation !== policy.reservationUsdMicros
  )
    throw Error("AI_SPEND_POLICY_CHANGE_REQUIRES_REVIEW");
  const usage = (day: string) =>
    db
      .prepare(
        "SELECT COALESCE(sum(max(reserved,COALESCE(actual,0))),0) lifetime,COALESCE(sum(CASE WHEN day=? THEN max(reserved,COALESCE(actual,0)) ELSE 0 END),0) daily FROM ai_spend_calls",
      )
      .get(day)! as { lifetime: number; daily: number };
  const dayOf = (now: number) => {
    if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000)
      throw Error("AI_INVALID_SPEND_TIME");
    return new Date(now).toISOString().slice(0, 10);
  };
  return {
    reserve(orderId: string, version: number, now = Date.now()) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          orderId,
        ) ||
        !Number.isSafeInteger(version) ||
        version < 1
      )
        throw Error("AI_INVALID_ORDER_RESERVATION");
      orderId = orderId.toLowerCase();
      let day = dayOf(now);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (
          db
            .prepare(
              "SELECT id FROM ai_spend_calls WHERE order_id=? AND version=?",
            )
            .get(orderId, version)
        )
          throw Error("AI_ORDER_ALREADY_RESERVED");
        const hasHolds = db
          .prepare("SELECT 1 FROM sqlite_master WHERE name='sales_ai_holds'")
          .get();
        const ownHold = hasHolds
          ? db
              .prepare(
                "SELECT day FROM sales_ai_holds WHERE order_id=? AND version=?",
              )
              .get(orderId, version)
          : null;
        if (ownHold) day = String(ownHold.day);
        const totals = usage(day);
        const holds = hasHolds
          ? db
              .prepare(
                "SELECT coalesce(sum(reserved),0) AS lifetime,coalesce(sum(CASE WHEN day=? THEN reserved ELSE 0 END),0) AS daily FROM sales_ai_holds WHERE NOT(order_id=? AND version=?)",
              )
              .get(day, orderId, version)
          : { lifetime: 0, daily: 0 };
        if (
          totals.lifetime +
            Number(holds!.lifetime) +
            policy.reservationUsdMicros >
            policy.lifetimeUsdMicros ||
          totals.daily + Number(holds!.daily) + policy.reservationUsdMicros >
            policy.dailyUsdMicros
        )
          throw Error("AI_SPEND_LIMIT_REACHED");
        const id = randomUUID();
        db.prepare(
          "INSERT INTO ai_spend_calls(id,order_id,version,day,reserved,state,created) VALUES(?,?,?,?,?,'reserved',?)",
        ).run(id, orderId, version, day, policy.reservationUsdMicros, now);
        if (hasHolds)
          db.prepare(
            "DELETE FROM sales_ai_holds WHERE order_id=? AND version=?",
          ).run(orderId, version);
        db.exec("COMMIT");
        return id;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    recordUsage(id: string, actualUsdMicros: number) {
      if (!Number.isSafeInteger(actualUsdMicros) || actualUsdMicros < 0)
        throw Error("AI_INVALID_SPEND_USAGE");
      // Never lower a recorded cost, including delayed or duplicate provider callbacks.
      const changed = db
        .prepare(
          "UPDATE ai_spend_calls SET actual=max(COALESCE(actual,0),?) WHERE id=?",
        )
        .run(actualUsdMicros, id);
      if (!changed.changes) throw Error("AI_SPEND_RESERVATION_NOT_FOUND");
    },
    finish(id: string, state: "completed" | "uncertain") {
      if (!["completed", "uncertain"].includes(state))
        throw Error("AI_INVALID_SPEND_STATE");
      const changed = db
        .prepare(
          "UPDATE ai_spend_calls SET state=? WHERE id=? AND state='reserved' AND (?='uncertain' OR actual IS NOT NULL)",
        )
        .run(state, id, state);
      if (!changed.changes) throw Error("AI_SPEND_TRANSITION_REFUSED");
    },
    summary(now = Date.now()) {
      const day = dayOf(now),
        totals = usage(day);
      const counts = db
        .prepare(
          "SELECT count(*) calls,COALESCE(sum(state='reserved'),0) pending,COALESCE(sum(state='uncertain'),0) uncertain FROM ai_spend_calls",
        )
        .get()!;
      return {
        dayUtc: day,
        dailyReservedOrActualUsdMicros: totals.daily,
        lifetimeReservedOrActualUsdMicros: totals.lifetime,
        calls: Number(counts.calls),
        pending: Number(counts.pending),
        uncertain: Number(counts.uncertain),
      };
    },
  };
}
