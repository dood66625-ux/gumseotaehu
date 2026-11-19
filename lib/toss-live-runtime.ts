import { createHash } from "node:crypto";
import { config } from "./config";
import { db, one, run, tx, all } from "./db";
import { Fault } from "./security";
import { ownOrder, type Session } from "./service";
import { TossOrderCoordinator } from "./integrations/toss-orders";
import { TossLiveContract } from "./integrations/toss-live";
import { createTossLiveTransport } from "./integrations/toss-http";
import { createTossCutoverFile, readTossCutoverFile } from "./toss-cutover";
export function liveTossOptions() {
  if (process.env.TOSS_PAYMENT_MODE !== "live")
    throw Error("TOSS_LIVE_DISABLED");
  if (process.env.LIVE_PAYMENTS_APPROVAL !== "live-payments-approved")
    throw Error("LIVE_PAYMENTS_NOT_APPROVED");
  const cfg = config(),
    merchantId = process.env.TOSS_LIVE_MERCHANT_ID ?? "",
    secret = process.env.TOSS_LIVE_SECRET_KEY ?? "",
    file = process.env.TOSS_LIVE_CUTOVER_FILE ?? "";
  if (!cfg.origin.startsWith("https://"))
    throw Error("TOSS_LIVE_HTTPS_REQUIRED");
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(merchantId) ||
    !/^live_(?:gsk|sk)_[A-Za-z0-9_]{8,500}$/.test(secret) ||
    !file
  )
    throw Error("TOSS_LIVE_CONFIG_REQUIRED");
  const profileDigest = createHash("sha256")
    .update(
      JSON.stringify(["gumseo-toss-live-v1", cfg.origin, merchantId, secret]),
    )
    .digest("hex");
  return { cfg, merchantId, secret, file, profileDigest };
}
/** Explicit offline enrollment only; creation performs no payment request. */
export function enrollLiveToss(now = Date.now()) {
  const o = liveTossOptions();
  if (
    !one(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='privacy_checkpoint_source'",
    )
  )
    throw Error("TOSS_CUTOVER_SOURCE_REQUIRED");
  const source = one(
    "SELECT source_id FROM privacy_checkpoint_source WHERE id=1",
  );
  if (!source) throw Error("TOSS_CUTOVER_SOURCE_REQUIRED");
  return tx(() => {
    db().exec(
      "CREATE TABLE IF NOT EXISTS toss_live_enrollment(id INTEGER PRIMARY KEY CHECK(id=1),profile_digest TEXT NOT NULL,cutoff INTEGER NOT NULL,recovery_hold INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS toss_live_orders(order_id TEXT PRIMARY KEY REFERENCES orders(id),profile_digest TEXT NOT NULL)",
    );
    if (one("SELECT 1 FROM toss_live_enrollment"))
      throw Error("TOSS_LIVE_ALREADY_ENROLLED");
    if (one("SELECT 1 FROM toss_attempts LIMIT 1"))
      throw Error("TOSS_LIVE_ISOLATED_DATABASE_REQUIRED");
    const record = createTossCutoverFile(
      o.file,
      { sourceId: source.source_id, profileDigest: o.profileDigest },
      o.cfg.key,
      now,
    );
    run(
      "INSERT INTO toss_live_enrollment VALUES(1,?,?,0)",
      o.profileDigest,
      record.createdAtOrAfter,
    );
    return {
      paymentsEnabledByCreation: false,
      createdAtOrAfter: record.createdAtOrAfter,
    };
  });
}
function ready() {
  const o = liveTossOptions();
  if (
    !one(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='toss_live_enrollment'",
    )
  )
    throw Error("TOSS_LIVE_NOT_ENROLLED");
  const row = one("SELECT * FROM toss_live_enrollment WHERE id=1"),
    source = one("SELECT source_id FROM privacy_checkpoint_source WHERE id=1");
  if (!row || row.recovery_hold !== 0)
    throw Error("TOSS_LIVE_RESTORE_REVIEW_REQUIRED");
  if (row.profile_digest !== o.profileDigest || !source)
    throw Error("TOSS_LIVE_PROFILE_MISMATCH");
  const record = readTossCutoverFile(
    o.file,
    { sourceId: source.source_id, profileDigest: o.profileDigest },
    o.cfg.key,
  );
  if (row.cutoff !== record.createdAtOrAfter)
    throw Error("TOSS_LIVE_CUTOFF_MISMATCH");
  return { ...o, cutoff: row.cutoff };
}
function coordinator(o: ReturnType<typeof ready>, fetcher?: typeof fetch) {
  return new TossOrderCoordinator(
    new TossLiveContract(
      o.secret,
      o.merchantId,
      createTossLiveTransport({
        enabled: true,
        approval: "live-payments-approved",
        fetch: fetcher,
      }),
    ),
    o.merchantId,
    "live",
  );
}
export async function confirmLiveToss(
  s: Session,
  orderId: string,
  key: string,
  amount: number,
  fetcher?: typeof fetch,
) {
  const o = ready();
  tx(() => {
    const order = ownOrder(s, orderId);
    if (order.created < o.cutoff || order.amount !== amount)
      throw new Fault("운영 결제 대상 주문을 확인해 주세요.", 409);
    if (
      !one(
        "SELECT 1 FROM toss_live_orders WHERE order_id=? AND profile_digest=?",
        orderId,
        o.profileDigest,
      )
    ) {
      if (
        order.payment_status !== "pending" ||
        one("SELECT 1 FROM toss_attempts WHERE order_id=?", orderId) ||
        one("SELECT 1 FROM pg_ledger WHERE order_id=?", orderId)
      )
        throw new Fault("다른 결제 경로의 주문입니다.", 409);
      run("INSERT INTO toss_live_orders VALUES(?,?)", orderId, o.profileDigest);
      // Bind before any PG request: a verified live purchase must never fall back to a mock report.
      run(
        "INSERT INTO order_generation_lanes VALUES(?,'openai',?,?)",
        orderId,
        order.version,
        Date.now(),
      );
    }
  });
  return coordinator(o, fetcher).confirm(s, orderId, key, amount);
}
export function liveTossReceiptCoordinator() {
  const o = ready();
  const c = coordinator(o, async () => {
    throw Error("RECEIPT_ONLY");
  });
  return {
    merchantId: o.merchantId,
    notify(body: unknown) {
      const id =
        body && typeof body === "object"
          ? (body as { orderId?: unknown }).orderId
          : null;
      if (
        typeof id !== "string" ||
        !one(
          "SELECT 1 FROM toss_live_orders WHERE order_id=? AND profile_digest=?",
          id,
          o.profileDigest,
        )
      )
        return { queued: false };
      return c.notify(body);
    },
  };
}
export async function recoverLiveToss(
  fetcher?: typeof fetch,
  stopping?: () => boolean,
) {
  if (
    !process.env.TOSS_PAYMENT_MODE ||
    process.env.TOSS_PAYMENT_MODE === "disabled"
  )
    return { state: "disabled" as const, processed: 0 };
  const o = ready(),
    c = coordinator(o, fetcher);
  const rows = all(
    "SELECT a.order_id FROM toss_attempts a JOIN toss_live_orders b ON b.order_id=a.order_id WHERE b.profile_digest=? AND a.merchant_id=? AND a.lease_until<=? AND a.next_check<=? AND (a.needs_check=1 OR a.state IN ('confirming','uncertain')) ORDER BY a.updated LIMIT 5",
    o.profileDigest,
    o.merchantId,
    Date.now(),
    Date.now(),
  );
  let processed = 0;
  for (const row of rows) {
    if (stopping?.()) break;
    ready();
    try {
      await c.recover(row.order_id);
    } catch {}
    processed++;
  }
  return { state: "ready" as const, processed };
}
