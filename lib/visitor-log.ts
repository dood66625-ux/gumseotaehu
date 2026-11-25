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
    ? database.prepare("SELECT * FROM visits WHERE id=?").get(key)
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
  const rows = database
    .prepare(
      "SELECT * FROM visits ORDER BY last_seen DESC,id LIMIT 50 OFFSET ?",
    )
    .all(page * 50) as unknown as VisitRow[];
  return {
    total: Number(
      database.prepare("SELECT count(*) AS n FROM visits").get()!.n,
    ),
    page,
    visits: rows.map((v) => ({
      ...v,
      events: database
        .prepare(
          "SELECT stage,at FROM visit_events WHERE visit_id=? ORDER BY at,id",
        )
        .all(v.id),
      orders: database
        .prepare(
          "SELECT DISTINCT o.id,o.payment_status AS payment,o.paid_at,o.fulfillment,o.content_deleted,o.expires FROM visit_readings l JOIN reading_history h ON h.reading_id=l.reading_id JOIN orders o ON o.id=h.order_id WHERE l.visit_id=? ORDER BY o.created DESC LIMIT 20",
        )
        .all(v.id),
    })),
  };
}
