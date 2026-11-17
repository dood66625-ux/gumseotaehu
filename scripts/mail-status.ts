/** Explicit local DB path only; never loads env, creates a DB, or runs migrations. */
import { DatabaseSync } from "node:sqlite";
import { lstatSync } from "node:fs";
import { mailQueueHealth } from "../lib/mail-health";
let database: DatabaseSync | undefined;
try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw Error("USAGE");
  const stat = lstatSync(args[0]);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error("INVALID_DATABASE");
  database = new DatabaseSync(args[0], { readOnly: true });
  database.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=3000;");
  const status = mailQueueHealth(database);
  console.log(JSON.stringify(status, null, 2));
  if (status.requiresAttention) process.exitCode = 2;
} catch {
  console.error(
    "MAIL_STATUS_UNAVAILABLE: use npm run mail:status -- <existing-database>. No email sent; values suppressed.",
  );
  process.exitCode = 1;
} finally {
  database?.close();
}
