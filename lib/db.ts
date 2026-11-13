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
export function tx<T>(fn: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}
export function closeDb() {
  instance?.close();
  instance = undefined as unknown as DatabaseSync;
}
