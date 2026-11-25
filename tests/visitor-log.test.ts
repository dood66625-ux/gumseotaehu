import { beforeEach, afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  recordVisit,
  visitorOverview,
  linkVisitReading,
  referrerHost,
} from "../lib/visitor-log";
let database: DatabaseSync;
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(readFileSync("db/001-init.sql", "utf8"));
});
afterEach(() => database.close());
it("records server time and source host without retaining URLs, query tokens or the cookie", () => {
  const first = recordVisit(
    database,
    null,
    "landing",
    "https://search.example/path?secret=private",
    1000,
  );
  recordVisit(database, first.token, "birth", "https://other.example/", 2000);
  recordVisit(database, first.token, "birth", "https://other.example/", 2100);
  const page = visitorOverview(database, 0, 3000);
  expect(page.total).toBe(1);
  expect(page.visits[0].source).toBe("search.example");
  expect(page.visits[0].first_seen).toBe(1000);
  expect(page.visits[0].last_seen).toBe(2100);
  expect(page.visits[0].last_stage).toBe("birth");
  expect(page.visits[0].events).toHaveLength(2);
  expect(JSON.stringify(page)).not.toContain(first.token);
  expect(JSON.stringify(page)).not.toContain("secret");
  expect(referrerHost("javascript:alert(1)")).toBe("direct");
});
it("only links conversion to an actual stored order and follows its server state", () => {
  const visit = recordVisit(database, null, "checkout", "", 1000);
  database
    .prepare("INSERT INTO readings VALUES(?,?,?,?,?,?,?)")
    .run(
      "reading",
      "session",
      "19+",
      "encrypted",
      "encrypted",
      "encrypted",
      1000,
    );
  linkVisitReading(database, visit.token, "reading");
  database
    .prepare(
      "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,created,consent_enc) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "order",
      "reading",
      "email-hash",
      "encrypted",
      22000,
      "pending",
      "waiting",
      2000,
      "encrypted",
    );
  database
    .prepare("INSERT INTO reading_history VALUES(?,?,?)")
    .run("order", "reading", 1);
  expect(
    visitorOverview(database, 0, 3000).visits[0].orders[0].paid_at,
  ).toBeNull();
  database
    .prepare(
      "UPDATE orders SET paid_at=2500,payment_status='paid' WHERE id='order'",
    )
    .run();
  expect(visitorOverview(database, 0, 3000).visits[0].orders[0].paid_at).toBe(
    2500,
  );
  database.prepare("DELETE FROM visit_readings").run();
  expect(visitorOverview(database, 0, 3000).visits[0].orders).toHaveLength(0);
});
it("expires old visits at 30 days and starts a new session after inactivity", () => {
  const first = recordVisit(database, null, "landing", "", 1000);
  const end = 1000 + 30 * 86400000;
  const next = recordVisit(database, first.token, "checkout", "", end - 100);
  expect(next.id).not.toBe(first.id);
  expect(visitorOverview(database, 0, end + 1).total).toBe(1);
  expect(
    database.prepare("SELECT 1 FROM visits WHERE id=?").get(first.id),
  ).toBeUndefined();
  expect(
    database
      .prepare("SELECT count(*) AS n FROM visit_events WHERE visit_id=?")
      .get(first.id)!.n,
  ).toBe(0);
});
it("limits event growth and keeps history pagination bounded", () => {
  const first = recordVisit(database, null, "landing", "", 1000);
  for (let i = 0; i < 150; i++)
    recordVisit(database, first.token, i % 2 ? "name" : "birth", "", 1001 + i);
  expect(visitorOverview(database, 0, 2000).visits[0].events).toHaveLength(120);
});

it("groups repeated network visits and paginates 15 groups without losing session history", () => {
  const a = recordVisit(database, null, "landing", "", 1000),
    b = recordVisit(database, null, "checkout", "", 2000);
  for (const v of [a, b])
    database
      .prepare("INSERT INTO visit_networks VALUES(?,?)")
      .run(v.id, "same-synthetic-network");
  for (let i = 0; i < 15; i++)
    recordVisit(database, null, "landing", "", 3000 + i);
  const first = visitorOverview(database, 0, 4000),
    second = visitorOverview(database, 1, 4000);
  expect(first.total).toBe(16);
  expect(first.visits).toHaveLength(15);
  expect(second.visits).toHaveLength(1);
  expect(second.visits[0].sessionCount).toBe(2);
  expect(second.visits[0].sessions).toHaveLength(2);
  expect(second.visits[0].last_stage).toBe("checkout");
  expect(second.visits[0].first_seen).toBe(1000);
});
