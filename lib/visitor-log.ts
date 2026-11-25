import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { visitStages } from "./visit-stages";
type VisitRow = {
  id: string;
  first_seen: number;
  last_seen: number;
  source: string;
  entry_stage: string;
  last_stage: string;
};
const retention = 30 * 86400000;
export const visitorCookie = "gs_visit";
export function visitKey(token: unknown) {
  return typeof token === "string" && /^[a-f0-9]{48}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;
}
export function referrerHost(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return "direct";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.hostname.slice(0, 253)
      : "direct";
  } catch {
    return "direct";
  }
}
export function recordVisit(
  database: DatabaseSync,
  token: unknown,
  stage: keyof typeof visitStages,
  referrer: unknown,
  now = Date.now(),
) {
  database
    .prepare("DELETE FROM visits WHERE first_seen<?")
    .run(now - retention);
  const key = visitKey(token);
  const old = key
    ? database
        .prepare("SELECT * FROM visits WHERE id=? AND last_seen>?")
        .get(key, now - 30 * 60000)
    : null;
  const nextToken = old ? (token as string) : randomBytes(24).toString("hex");
  const id = visitKey(nextToken)!;
  if (!old) {
    if (
      Number(database.prepare("SELECT count(*) AS n FROM visits").get()!.n) >=
      50000
    )
      throw Error("VISITOR_CAPACITY");
    database
      .prepare(
        "INSERT INTO visits(id,first_seen,last_seen,source,entry_stage,last_stage) VALUES(?,?,?,?,?,?)",
      )
      .run(id, now, now, referrerHost(referrer), stage, stage);
  } else
    database
      .prepare("UPDATE visits SET last_seen=?,last_stage=? WHERE id=?")
      .run(now, stage, id);
  const last = database
    .prepare(
      "SELECT stage,at FROM visit_events WHERE visit_id=? ORDER BY id DESC LIMIT 1",
    )
    .get(id);
  const count = Number(
    database
      .prepare("SELECT count(*) AS n FROM visit_events WHERE visit_id=?")
      .get(id)!.n,
  );
  if (
    count < 120 &&
    (!last || last.stage !== stage || now - Number(last.at) > 60000)
  )
    database
      .prepare("INSERT INTO visit_events(visit_id,stage,at) VALUES(?,?,?)")
      .run(id, stage, now);
  return { token: nextToken, id };
}
export function linkVisitReading(
  database: DatabaseSync,
  token: unknown,
  readingId: string,
) {
  const key = visitKey(token);
  if (key && database.prepare("SELECT id FROM visits WHERE id=?").get(key))
    database
      .prepare(
        "INSERT OR IGNORE INTO visit_readings(visit_id,reading_id) VALUES(?,?)",
      )
      .run(key, readingId);
}
export function visitorOverview(
  database: DatabaseSync,
  page = 0,
  now = Date.now(),
) {
  database
    .prepare("DELETE FROM visits WHERE first_seen<?")
    .run(now - retention);
  const groupSql =
    "SELECT coalesce(n.network_key,v.id) AS group_key,MAX(v.last_seen) AS recent FROM visits v LEFT JOIN visit_networks n ON n.visit_id=v.id GROUP BY group_key";
  const groups = database
    .prepare(
      "SELECT * FROM (" +
        groupSql +
        ") ORDER BY recent DESC,group_key LIMIT 15 OFFSET ?",
    )
    .all(page * 15);
  return {
    total: Number(
      database.prepare("SELECT count(*) AS n FROM (" + groupSql + ")").get()!.n,
    ),
    page,
    visits: groups.map((g) => {
      const rows = database
        .prepare(
          "SELECT v.* FROM visits v LEFT JOIN visit_networks n ON n.visit_id=v.id WHERE coalesce(n.network_key,v.id)=? ORDER BY v.last_seen DESC,v.id LIMIT 100",
        )
        .all(g.group_key) as unknown as VisitRow[];
      const sessions = rows.map((v) => ({
        ...v,
        events: database
          .prepare(
            "SELECT stage,at FROM visit_events WHERE visit_id=? ORDER BY at,id",
          )
          .all(v.id),
      }));
      const latest = sessions[0];
      const oldest = database
        .prepare(
          "SELECT v.first_seen,v.entry_stage FROM visits v LEFT JOIN visit_networks n ON n.visit_id=v.id WHERE coalesce(n.network_key,v.id)=? ORDER BY v.first_seen,v.id LIMIT 1",
        )
        .get(g.group_key)!;
      return {
        ...latest,
        first_seen: oldest.first_seen,
        entry_stage: oldest.entry_stage,
        sessionCount: Number(
          database
            .prepare(
              "SELECT count(*) AS n FROM visits v LEFT JOIN visit_networks n ON n.visit_id=v.id WHERE coalesce(n.network_key,v.id)=?",
            )
            .get(g.group_key)!.n,
        ),
        sessions,
        orders: database
          .prepare(
            "SELECT DISTINCT o.id,o.payment_status AS payment,o.paid_at,o.fulfillment,o.content_deleted,o.expires FROM visit_readings l JOIN reading_history h ON h.reading_id=l.reading_id JOIN orders o ON o.id=h.order_id JOIN visits v ON v.id=l.visit_id LEFT JOIN visit_networks n ON n.visit_id=v.id WHERE coalesce(n.network_key,v.id)=? ORDER BY o.created DESC LIMIT 20",
          )
          .all(g.group_key),
      };
    }),
  };
}
