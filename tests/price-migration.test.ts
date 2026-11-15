import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { migrateOrderPrice } from "../lib/price-migration";
function legacy() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync("db/001-init.sql", "utf8").replace(
      "CHECK(amount IN (22000,33000))",
      "CHECK(amount=33000)",
    ),
  );
  db.exec(`INSERT INTO readings VALUES('r','session','19+','sealed-input','sealed-chart','sealed-preview',1);
    INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,payment_key,created,consent_enc) VALUES('old','r','old-email','sealed-email',33000,'paid','ready','original-key',1,'original-sealed-consent');
    INSERT INTO pg_ledger VALUES('original-key','old',33000,'DONE',NULL);
    INSERT INTO reports VALUES('report','old',1,'immutable-sealed-report',1);
    INSERT INTO refunds VALUES('refund','old',33000,'sealed-reason','pending',NULL,1,NULL);`);
  return db;
}
function newOrder(db: DatabaseSync, amount: number, email = "new-email") {
  db.prepare(
    "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,created,consent_enc) VALUES(?,?,?,?,?,'pending','waiting',1,'sealed-consent')",
  ).run("new-" + email, "r", email, "sealed-email", amount);
}
it("migrates the old fixed-price table without altering paid amounts, sealed content, foreign keys, or indexes", () => {
  const db = legacy();
  try {
    const before = ["orders", "pg_ledger", "reports", "refunds"].map((t) =>
      db.prepare("SELECT * FROM " + t).all(),
    );
    migrateOrderPrice(db);
    expect(
      ["orders", "pg_ledger", "reports", "refunds"].map((t) =>
        db.prepare("SELECT * FROM " + t).all(),
      ),
    ).toEqual(before);
    newOrder(db, 22000);
    expect(
      db.prepare("SELECT amount FROM orders WHERE id='old'").get()!.amount,
    ).toBe(33000);
    expect(() => newOrder(db, 5500, "bad-price")).toThrow();
    expect(() => newOrder(db, 1, "tampered")).toThrow();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
    expect(() => newOrder(db, 22000, "old-email")).toThrow();
    expect(() => db.exec("DELETE FROM readings WHERE id='r'")).toThrow();
    migrateOrderPrice(db);
    expect(
      db
        .prepare("SELECT count(*) n FROM schema_migrations WHERE version=8")
        .get()!.n,
    ).toBe(1);
  } finally {
    db.close();
  }
});
it("rolls back a failed migration and restores foreign-key enforcement with old rows intact", () => {
  const db = legacy();
  try {
    db.exec(
      "CREATE TABLE orders_price_v8(keep_me TEXT); INSERT INTO orders_price_v8 VALUES('unrelated-existing-table')",
    );
    expect(() => migrateOrderPrice(db)).toThrow();
    expect(
      db.prepare("SELECT amount FROM orders WHERE id='old'").get()!.amount,
    ).toBe(33000);
    expect(db.prepare("SELECT payload FROM reports").get()!.payload).toBe(
      "immutable-sealed-report",
    );
    expect(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => newOrder(db, 22000)).toThrow();
    expect(
      db
        .prepare("SELECT count(*) n FROM schema_migrations WHERE version=8")
        .get()!.n,
    ).toBe(0);
  } finally {
    db.close();
  }
});
