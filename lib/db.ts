import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";
let instance: DatabaseSync;
export function db() {
  if (!instance) {
    const path = config().db;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    instance = new DatabaseSync(path);
    chmodSync(path, 0o600);
    instance.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    instance.exec(readFileSync("db/001-init.sql", "utf8"));
  }
  return instance;
}
export function run(sql: string, ...args: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
export function one<T = Record<string, any>>(
  sql: string,
  ...args: SQLInputValue[]
): T | undefined {
  return db()
    .prepare(sql)
    .get(...args) as T | undefined;
}
export function all<T = Record<string, any>>(
  sql: string,
  ...args: SQLInputValue[]
): T[] {
  return db()
    .prepare(sql)
    .all(...args) as T[];
}
let transactionDepth = 0;
export function tx<T>(fn: () => T): T {
  if (fn.constructor.name === "AsyncFunction")
    throw Error("ASYNC_TRANSACTION_NOT_SUPPORTED");
  const nested = transactionDepth > 0,
    name = "geumseo_" + transactionDepth;
  db().exec(nested ? "SAVEPOINT " + name : "BEGIN IMMEDIATE");
  transactionDepth++;
  try {
    const result = fn();
    if (result && typeof (result as any).then === "function")
      throw Error("ASYNC_TRANSACTION_NOT_SUPPORTED");
    db().exec(nested ? "RELEASE SAVEPOINT " + name : "COMMIT");
    return result;
  } catch (error) {
    if (nested) {
      db().exec("ROLLBACK TO SAVEPOINT " + name);
      db().exec("RELEASE SAVEPOINT " + name);
    } else db().exec("ROLLBACK");
    throw error;
  } finally {
    transactionDepth--;
  }
}
export function closeDb() {
  instance?.close();
  instance = undefined as unknown as DatabaseSync;
}
