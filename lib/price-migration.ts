import type { DatabaseSync } from "node:sqlite";
/** Widen the old CHECK without repricing rows or rewriting child foreign-key references. */
export function migrateOrderPrice(db: DatabaseSync) {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name='orders'",
    )
    .get();
  if (!row || typeof row.sql !== "string") throw Error("ORDER_SCHEMA_REQUIRED");
  const oldCheck = /CHECK\s*\(\s*amount\s*=\s*33000\s*\)/i;
  if (!oldCheck.test(row.sql)) {
    if (
      !/CHECK\s*\(\s*amount\s+IN\s*\(\s*22000\s*,\s*33000\s*\)\s*\)/i.test(
        row.sql,
      )
    )
      throw Error("UNSUPPORTED_ORDER_PRICE_SCHEMA");
    db.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(8,?)").run(
      Date.now(),
    );
    return;
  }
  if (db.isTransaction) throw Error("PRICE_MIGRATION_REQUIRES_TOP_LEVEL");
  const foreignKeys = Number(
    db.prepare("PRAGMA foreign_keys").get()!.foreign_keys,
  );
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
  try {
    // Another worker may already have migrated while this connection waited for the lock.
    const current = db
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE name='orders' AND type='table'",
      )
      .get()!.sql as string;
    if (oldCheck.test(current)) {
      const objects = db
        .prepare(
          "SELECT sql FROM sqlite_schema WHERE tbl_name='orders' AND type IN ('index','trigger') AND sql IS NOT NULL",
        )
        .all();
      const create = current
        .replace(
          /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?orders["`\]]?/i,
          "CREATE TABLE orders_price_v8",
        )
        .replace(oldCheck, "CHECK(amount IN (22000,33000))");
      if (create === current) throw Error("UNSUPPORTED_ORDER_PRICE_SCHEMA");
      db.exec(create);
      db.exec(
        "INSERT INTO orders_price_v8 SELECT * FROM orders; DROP TABLE orders; ALTER TABLE orders_price_v8 RENAME TO orders;",
      );
      for (const object of objects) db.exec(object.sql as string);
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw Error("PRICE_MIGRATION_FOREIGN_KEY_FAILURE");
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(8,?)").run(
      Date.now(),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=" + foreignKeys);
  }
}
