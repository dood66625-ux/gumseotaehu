/** Offline batch enrollment/check. Provider fetch is forbidden in this process. */
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../lib/config";
import { db, closeDb } from "../lib/db";
import {
  publishPrivacyCheckpoint,
  privacyCheckpointDirectory,
} from "../lib/privacy-checkpoint";
import {
  enrollLiveToss,
  validateLiveTossEnrollment,
} from "../lib/toss-live-runtime";
import { aiEnrollmentOptions } from "../lib/ai-worker-runtime";
import {
  enrollAiWorker,
  readAiWorkerEnrollment,
} from "../lib/ai-worker-enrollment";
import { MailDeliveryCoordinator } from "../lib/mail-delivery";
import { createResendMailGateway } from "../lib/integrations/resend-mail";
import {
  createMailCutoverFile,
  readMailCutoverFile,
} from "../lib/mail-cutover";
async function main() {
  globalThis.fetch = async () => {
    throw Error("SALES_ENROLLMENT_NETWORK_FORBIDDEN");
  };
  const args = process.argv.slice(2);
  if (
    args.length !== 1 ||
    !["--enroll", "--check", "--import-operator"].includes(args[0])
  )
    throw Error("SALES_ENROLL_ARGUMENTS_REQUIRED");
  const cfg = config(),
    database = db();
  if (args[0] === "--import-operator") {
    database.exec(
      "CREATE TABLE IF NOT EXISTS sales_bootstrap(id INTEGER PRIMARY KEY CHECK(id=1),created INTEGER NOT NULL)",
    );
    if (database.prepare("SELECT 1 FROM orders LIMIT 1").get())
      throw Error("SALES_IMPORT_REQUIRES_UNUSED_DATABASE");
    const text = readFileSync(0, "utf8");
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
      throw Error("SALES_BOOTSTRAP_TOO_LARGE");
    const raw = JSON.parse(text);
    if (raw.version !== 1 || raw.liveOrders !== 0)
      throw Error("SALES_BOOTSTRAP_SOURCE_REFUSED");
    const tables: Record<string, string[]> = {
      admin_credentials: ["id", "digest"],
      visits: [
        "id",
        "first_seen",
        "last_seen",
        "source",
        "entry_stage",
        "last_stage",
      ],
      visit_events: ["id", "visit_id", "stage", "at"],
      visit_networks: ["visit_id", "network_key"],
      visit_exclusions: ["network_key", "expires"],
    };
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const [table, columns] of Object.entries(tables)) {
        const rows = raw.tables?.[table] ?? [];
        if (!Array.isArray(rows) || rows.length > 250000)
          throw Error("SALES_BOOTSTRAP_INVALID");
        const statement = database.prepare(
          "INSERT OR IGNORE INTO " +
            table +
            "(" +
            columns.join(",") +
            ") VALUES(" +
            columns.map(() => "?").join(",") +
            ")" +
            (table === "admin_credentials"
              ? " ON CONFLICT(id) DO UPDATE SET digest=excluded.digest"
              : table === "visits"
                ? " ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,last_stage=excluded.last_stage"
                : ""),
        );
        for (const row of rows) {
          const values = columns.map((c) => row[c]);
          if (
            values.some((v) => !["string", "number"].includes(typeof v)) ||
            values.some((v) => typeof v === "string" && v.length > 2048)
          )
            throw Error("SALES_BOOTSTRAP_INVALID");
          statement.run(...values);
        }
      }
      database
        .prepare("INSERT OR IGNORE INTO sales_bootstrap VALUES(1,?)")
        .run(Date.now());
      database.exec("COMMIT");
    } catch (e) {
      database.exec("ROLLBACK");
      throw e;
    }
    console.log(
      "SALES_OPERATOR_AND_VISITS_IMPORTED; original database preserved",
    );
    return;
  }
  // These overrides exist only inside this offline enrollment process.
  process.env.TOSS_PAYMENT_MODE = "live";
  process.env.LIVE_PAYMENTS_APPROVAL = "live-payments-approved";
  const file = process.env.MAIL_CUTOVER_FILE;
  if (!file) throw Error("MAIL_CUTOVER_FILE_REQUIRED");
  const mail = new MailDeliveryCoordinator(
    {
      sender: process.env.TRANSACTION_MAIL_SENDER!,
      replyTo: process.env.TRANSACTION_MAIL_REPLY_TO!,
      origin: cfg.origin,
    },
    createResendMailGateway({
      apiKey: process.env.RESEND_API_KEY!,
      accountScope: process.env.RESEND_ACCOUNT_SCOPE!,
      enabled: false,
    }),
  );
  const ai = aiEnrollmentOptions();
  if (args[0] === "--enroll") {
    for (const path of [file, process.env.TOSS_LIVE_CUTOVER_FILE!, ai.file])
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    publishPrivacyCheckpoint(
      database,
      privacyCheckpointDirectory(cfg.db, cfg.key),
      cfg.key,
    );
    const has = (table: string) =>
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) &&
      database.prepare("SELECT 1 FROM " + table + " WHERE id=1").get();
    if (!has("toss_live_enrollment")) enrollLiveToss();
    if (!has("ai_worker_enrollment"))
      enrollAiWorker(database, { ...ai, approval: "customer-data-approved" });
    const source = database
      .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
      .get()!;
    if (!existsSync(file))
      createMailCutoverFile(
        file,
        {
          sourceId: String(source.source_id),
          profileDigest: mail.profileBinding,
        },
        cfg.key,
      );
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  validateLiveTossEnrollment();
  readAiWorkerEnrollment(database, ai);
  const source = database
    .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
    .get();
  if (!source) throw Error("SALES_SOURCE_REQUIRED");
  readMailCutoverFile(
    file,
    { sourceId: String(source.source_id), profileDigest: mail.profileBinding },
    cfg.key,
  );
  console.log(
    "SALES_ENROLLMENTS_VERIFIED; payment/AI/mail bindings valid; provider calls=0",
  );
}
main()
  .catch((error) => {
    const code =
      error instanceof Error && /^[A-Z_0-9]{3,100}$/.test(error.message)
        ? error.message
        : "SALES_ENROLLMENT_FAILED";
    console.error(code + "; values suppressed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
