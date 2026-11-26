/** Reserve capacity before offering/confirming a live payment. No provider requests. */
import type { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import { db } from "./db";
import { Fault } from "./security";
import type { AiSpendPolicy } from "./ai-spend-ledger";
import { aiEnrollmentOptions } from "./ai-worker-runtime";
import { readAiWorkerEnrollment } from "./ai-worker-enrollment";
import { MailDeliveryCoordinator } from "./mail-delivery";
import { createResendMailGateway } from "./integrations/resend-mail";
import { readMailCutoverFile } from "./mail-cutover";
export function holdSalesCapacity(
  database: DatabaseSync,
  orderId: string,
  version: number,
  policy: AiSpendPolicy,
  now = Date.now(),
) {
  const own = !database.isTransaction;
  if (own) database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "DELETE FROM sales_ai_holds WHERE order_id IN (SELECT id FROM orders WHERE payment_status NOT IN ('pending','paid','refund_pending')) OR (expires<? AND order_id IN (SELECT id FROM orders WHERE payment_status='pending') AND NOT EXISTS (SELECT 1 FROM toss_attempts a WHERE a.order_id=sales_ai_holds.order_id AND (a.approved_at IS NOT NULL OR coalesce(a.last_status,'') NOT IN ('ABORTED','EXPIRED','CANCELED'))))",
      )
      .run(now);
    const existing = database
      .prepare("SELECT version FROM sales_ai_holds WHERE order_id=?")
      .get(orderId);
    if (existing) {
      if (existing.version !== version)
        throw Error("SALES_CAPACITY_VERSION_MISMATCH");
      if (own) database.exec("COMMIT");
      return;
    }
    if (
      database
        .prepare("SELECT 1 FROM ai_spend_calls WHERE order_id=? AND version=?")
        .get(orderId, version)
    ) {
      if (own) database.exec("COMMIT");
      return;
    }
    const day = new Date(now).toISOString().slice(0, 10);
    const spent = database
      .prepare(
        "SELECT coalesce(sum(max(reserved,coalesce(actual,0))),0) AS lifetime,coalesce(sum(CASE WHEN day=? THEN max(reserved,coalesce(actual,0)) ELSE 0 END),0) AS daily FROM ai_spend_calls",
      )
      .get(day)!;
    const held = database
      .prepare(
        "SELECT coalesce(sum(reserved),0) AS lifetime,coalesce(sum(CASE WHEN day=? THEN reserved ELSE 0 END),0) AS daily FROM sales_ai_holds",
      )
      .get(day)!;
    if (
      Number(spent.lifetime) +
        Number(held.lifetime) +
        policy.reservationUsdMicros >
        policy.lifetimeUsdMicros ||
      Number(spent.daily) + Number(held.daily) + policy.reservationUsdMicros >
        policy.dailyUsdMicros
    )
      throw new Fault(
        "오늘 준비된 운명서 작성 수량이 소진되었습니다. 결제 전에 잠시 후 다시 확인해주세요.",
        503,
      );
    database
      .prepare("INSERT INTO sales_ai_holds VALUES(?,?,?,?,?)")
      .run(
        orderId,
        version,
        day,
        policy.reservationUsdMicros,
        now + 20 * 60000,
      );
    if (own) database.exec("COMMIT");
  } catch (e) {
    if (own) database.exec("ROLLBACK");
    throw e;
  }
}
export function ensureSalesCapacity(orderId: string, version: number) {
  if (process.env.SALES_MODE !== "live") return;
  if (
    process.env.AI_WORKER_MODE !== "openai" ||
    process.env.CUSTOMER_AI_APPROVAL !== "customer-data-approved" ||
    process.env.MAIL_WORKER_MODE !== "resend" ||
    process.env.CUSTOMER_MAIL_APPROVAL !== "customer-mail-approved"
  )
    throw new Fault(
      "운명서 제공 준비를 확인 중입니다. 잠시 후 다시 이용해주세요.",
      503,
    );
  const setup = aiEnrollmentOptions();
  readAiWorkerEnrollment(db(), setup);
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(process.env.OPENAI_API_KEY ?? ""))
    throw Error("AI_CREDENTIAL_REQUIRED");
  const cfg = config();
  const gateway = createResendMailGateway({
    apiKey: process.env.RESEND_API_KEY!,
    accountScope: process.env.RESEND_ACCOUNT_SCOPE!,
    enabled: false,
  });
  const mail = new MailDeliveryCoordinator(
    {
      origin: cfg.origin,
      sender: process.env.TRANSACTION_MAIL_SENDER!,
      replyTo: process.env.TRANSACTION_MAIL_REPLY_TO!,
    },
    gateway,
  );
  const source = db()
    .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
    .get();
  if (!source) throw Error("MAIL_CUTOVER_SOURCE_REQUIRED");
  readMailCutoverFile(
    process.env.MAIL_CUTOVER_FILE!,
    { sourceId: String(source.source_id), profileDigest: mail.profileBinding },
    cfg.key,
  );
  holdSalesCapacity(db(), orderId, version, setup.policy);
}
