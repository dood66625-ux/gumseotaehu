import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiSpendLedger } from "../lib/ai-spend-ledger";
const policy = {
  dailyUsdMicros: 120000,
  lifetimeUsdMicros: 180000,
  reservationUsdMicros: 60000,
};
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = Date.UTC(2026, 10, 18, 12),
  tomorrow = now + 86400000;
const dirs: string[] = [];
const dbs: DatabaseSync[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function open(path = ":memory:") {
  const db = new DatabaseSync(path);
  dbs.push(db);
  return db;
}
it("persists order/version deduplication across independent connections and restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-spend-"));
  dirs.push(dir);
  const path = join(dir, "spend.sqlite");
  const first = aiSpendLedger(open(path), policy);
  const id = first.reserve(a, 1, now);
  first.recordUsage(id, 10000);
  first.finish(id, "completed");
  const second = aiSpendLedger(open(path), policy);
  expect(() => second.reserve(a.toUpperCase(), 1, tomorrow)).toThrow(
    "AI_ORDER_ALREADY_RESERVED",
  );
  expect(second.summary(now)).toMatchObject({
    calls: 1,
    lifetimeReservedOrActualUsdMicros: 60000,
  });
});
it("holds unknown costs and enforces daily plus lifetime limits without automatic retries", () => {
  const ledger = aiSpendLedger(open(), policy);
  const id = ledger.reserve(a, 1, now);
  ledger.finish(id, "uncertain");
  ledger.reserve(b, 1, now);
  expect(() => ledger.reserve(c, 1, now)).toThrow("AI_SPEND_LIMIT_REACHED");
  ledger.reserve(c, 1, tomorrow);
  expect(() => ledger.reserve(a, 2, tomorrow)).toThrow(
    "AI_SPEND_LIMIT_REACHED",
  );
  expect(ledger.summary(tomorrow)).toMatchObject({
    calls: 3,
    uncertain: 1,
    pending: 2,
  });
});
it("higher usage increases exposure and delayed lower usage never releases budget", () => {
  const ledger = aiSpendLedger(open(), policy);
  const id = ledger.reserve(a, 1, now);
  ledger.recordUsage(id, 130000);
  ledger.recordUsage(id, 1000);
  expect(ledger.summary(now).lifetimeReservedOrActualUsdMicros).toBe(130000);
  expect(() => ledger.reserve(b, 1, now)).toThrow("AI_SPEND_LIMIT_REACHED");
});
it("cannot complete without usage, change saved policy, or resolve uncertainty silently", () => {
  const db = open(),
    ledger = aiSpendLedger(db, policy),
    id = ledger.reserve(a, 1, now);
  expect(() => ledger.finish(id, "completed")).toThrow(
    "AI_SPEND_TRANSITION_REFUSED",
  );
  ledger.finish(id, "uncertain");
  ledger.recordUsage(id, 5000);
  expect(() => ledger.finish(id, "completed")).toThrow(
    "AI_SPEND_TRANSITION_REFUSED",
  );
  expect(() =>
    aiSpendLedger(db, { ...policy, dailyUsdMicros: 180000 }),
  ).toThrow("AI_SPEND_POLICY_CHANGE_REQUIRES_REVIEW");
  expect(() => ledger.recordUsage("missing", 0)).toThrow(
    "AI_SPEND_RESERVATION_NOT_FOUND",
  );
});
it("rejects invalid policies and inputs before accepting a reservation", () => {
  expect(() =>
    aiSpendLedger(open(), { ...policy, reservationUsdMicros: 1 }),
  ).toThrow("AI_INVALID_SPEND_POLICY");
  const ledger = aiSpendLedger(open(), policy);
  expect(() => ledger.reserve("customer@example.com", 1, now)).toThrow(
    "AI_INVALID_ORDER_RESERVATION",
  );
  expect(() => ledger.reserve(a, 0, now)).toThrow(
    "AI_INVALID_ORDER_RESERVATION",
  );
  expect(() => ledger.reserve(a, 1, NaN)).toThrow("AI_INVALID_SPEND_TIME");
  expect(() => ledger.recordUsage("missing", -1)).toThrow(
    "AI_INVALID_SPEND_USAGE",
  );
});

it("cannot change active limits by mutating the caller policy object", () => {
  const requested = { ...policy };
  const ledger = aiSpendLedger(open(), requested);
  requested.dailyUsdMicros = 900000;
  requested.lifetimeUsdMicros = 900000;
  requested.reservationUsdMicros = 1;
  ledger.reserve(a, 1, now);
  ledger.reserve(b, 1, now);
  expect(() => ledger.reserve(c, 1, now)).toThrow("AI_SPEND_LIMIT_REACHED");
});
