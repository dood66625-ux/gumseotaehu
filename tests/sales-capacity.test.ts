import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { holdSalesCapacity } from "../lib/sales-capacity";
import { aiSpendLedger } from "../lib/ai-spend-ledger";
const policy = {
  reservationUsdMicros: 60000,
  dailyUsdMicros: 120000,
  lifetimeUsdMicros: 180000,
};
const ids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];
function fixture() {
  const d = new DatabaseSync(":memory:");
  d.exec(readFileSync("db/001-init.sql", "utf8"));
  for (const id of ids) {
    d.prepare("INSERT INTO readings VALUES(?,?,?,?,?,?,?)").run(
      id,
      "s",
      "19+",
      "x",
      "x",
      "x",
      1,
    );
    d.prepare(
      "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,created,consent_enc) VALUES(?,?,?,?,?,'pending','waiting',?,?)",
    ).run(id, id, "h", "x", 22000, 1, "x");
  }
  return d;
}
it("holds capacity before charging and atomically consumes only the own hold into the AI ledger", () => {
  const d = fixture();
  try {
    const ledger = aiSpendLedger(d, policy),
      now = Date.UTC(2026, 10, 26, 12);
    holdSalesCapacity(d, ids[0], 1, policy, now);
    holdSalesCapacity(d, ids[0], 1, policy, now);
    holdSalesCapacity(d, ids[1], 1, policy, now);
    expect(d.prepare("SELECT count(*) AS n FROM sales_ai_holds").get()!.n).toBe(
      2,
    );
    expect(() => holdSalesCapacity(d, ids[2], 1, policy, now)).toThrow("소진");
    const reservation = ledger.reserve(ids[0], 1, now);
    expect(reservation).toBeTruthy();
    expect(d.prepare("SELECT count(*) AS n FROM sales_ai_holds").get()!.n).toBe(
      1,
    );
    expect(() => ledger.reserve(ids[2], 1, now)).toThrow("LIMIT");
    expect(() => ledger.reserve(ids[0], 1, now)).toThrow("ALREADY_RESERVED");
  } finally {
    d.close();
  }
});
it("releases abandoned checkout slots but retains paid/uncertain slots and the original reservation day", () => {
  const d = fixture();
  try {
    const ledger = aiSpendLedger(d, policy),
      now = Date.UTC(2026, 10, 26, 23, 59);
    holdSalesCapacity(d, ids[0], 1, policy, now);
    holdSalesCapacity(d, ids[1], 1, policy, now);
    d.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(ids[0]);
    holdSalesCapacity(d, ids[2], 1, policy, now + 30 * 60000);
    expect(
      d.prepare("SELECT 1 FROM sales_ai_holds WHERE order_id=?").get(ids[1]),
    ).toBeUndefined();
    const reserved = ledger.reserve(ids[0], 1, now + 30 * 60000);
    expect(
      d.prepare("SELECT day FROM ai_spend_calls WHERE id=?").get(reserved)!.day,
    ).toBe("2026-11-26");
  } finally {
    d.close();
  }
});
it("preserves unverified payment slots until provider evidence is known", () => {
  const d = fixture();
  try {
    aiSpendLedger(d, policy);
    const now = Date.UTC(2026, 10, 26, 12);
    holdSalesCapacity(d, ids[0], 1, policy, now);
    holdSalesCapacity(d, ids[1], 1, policy, now);
    d.prepare(
      "INSERT INTO toss_attempts(order_id,payment_key,merchant_id,state,refund_reason_enc,created,updated) VALUES(?,?,?,'uncertain',?, ?,?)",
    ).run(ids[0], "synthetic-key", "m", "x", now, now);
    holdSalesCapacity(d, ids[2], 1, policy, now + 30 * 60000);
    expect(
      d.prepare("SELECT 1 FROM sales_ai_holds WHERE order_id=?").get(ids[0]),
    ).toBeTruthy();
    expect(
      d.prepare("SELECT 1 FROM sales_ai_holds WHERE order_id=?").get(ids[1]),
    ).toBeUndefined();
  } finally {
    d.close();
  }
});
