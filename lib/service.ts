import { validAdminToken } from "./admin-token";
import { requireMockPayment, isLiveTossOrder } from "./toss-mode";
import { requireLocalMailAccess } from "./local-mail-access";
import type { GenerationLane } from "./order-generation";
import { aiSpendReview, hasAiReservation } from "./ai-spend-review";
import { PRODUCT_PRICE_KRW, isSupportedOrderAmount } from "./product";
import { snapshotMailRecipient, snapshotTicketContact } from "./mail-records";
import {
  operationalHealth,
  workerHeartbeat,
  repairMissingJobs,
} from "./operations";
import { requireRecentAdmin } from "./admin-auth";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { all, one, run, tx, db } from "./db";
import { mailQueueHealth } from "./mail-health";
import { audit, event, Fault, hash, id, limit, open, seal } from "./security";
import {
  birthSchema,
  calculate,
  assertSubjectAge,
  ageAtKstDate,
  type Chart,
} from "./astrology";
import {
  preview,
  generate,
  validateReport,
  type Report,
} from "./interpretation";
export type Session = {
  id: string;
  email_hash: string | null;
  role: string;
  expires: number;
};
export function newSession() {
  const token = randomBytes(32).toString("base64url"),
    sid = hash(token);
  run(
    "INSERT INTO sessions VALUES(?,?,?,?,?)",
    sid,
    null,
    "customer",
    Date.now() + 2 * 3600000,
    Date.now(),
  );
  return {
    token,
    session: one<Session>("SELECT * FROM sessions WHERE id=?", sid)!,
  };
}
export function sessionFor(token: string) {
  if (typeof token !== "string" || token.length > 256) return undefined;
  const session = one<Session>(
    "SELECT * FROM sessions WHERE id=? AND expires>?",
    hash(token),
    Date.now(),
  );
  if (!session) return undefined;
  if (session.role !== "customer" && !validAdminToken(token)) return undefined;
  if (session.role === "customer" && token.startsWith("ad1.")) return undefined;
  return session;
}
export function requireEmail(s: Session) {
  const current = one(
    "SELECT email_hash FROM sessions WHERE id=? AND expires>?",
    s.id,
    Date.now(),
  );
  if (!s.email_hash || current?.email_hash !== s.email_hash)
    throw new Fault("이메일 인증이 필요합니다.", 401);
}
export function readingFor(
  s: Session,
  rid: string,
): Record<string, any> & { input: any; chart: Chart; preview: any } {
  const r = one(
    "SELECT * FROM readings WHERE id=? AND session_id=?",
    rid,
    s.id,
  );
  if (!r || open(r.input_enc) === null)
    throw new Fault("풀이를 찾을 수 없습니다.", 404);
  return {
    ...r,
    input: open(r.input_enc),
    chart: open<Chart>(r.chart_enc),
    preview: open(r.preview_enc),
    purchaseEligible:
      r.age_category !== "14-18" &&
      ageAtKstDate(open<Chart>(r.chart_enc).solarDate) >= 19,
  };
}
export function makeReading(s: Session, raw: unknown) {
  limit("reading:" + s.id, 20, 86400000);
  const input = birthSchema.parse(raw),
    chart = calculate(input),
    p = preview(chart),
    rid = id();
  assertSubjectAge(chart.solarDate);
  run(
    "INSERT INTO readings VALUES(?,?,?,?,?,?,?)",
    rid,
    s.id,
    input.age,
    seal(input),
    seal(chart),
    seal(p),
    Date.now(),
  );
  event("preview_ready", rid);
  return rid;
}
const emailSchema = z.string().trim().toLowerCase().email().max(254);
export function enqueueMail(
  emailHash: string,
  payload: unknown,
  recipient?: string,
) {
  return tx(() => {
    const mid = id();
    run(
      "INSERT INTO outbox VALUES(?,?,?,?,?)",
      mid,
      emailHash,
      seal(payload),
      Date.now(),
      "local_only",
    );
    snapshotMailRecipient(mid, emailHash, payload, recipient);
    return mid;
  });
}

export function requestOtp(s: Session, email: unknown) {
  const e = emailSchema.parse(email);
  limit("otp-session:" + s.id, 5, 900000);
  limit("otp-email:" + hash(e), 5, 900000);
  const cid = id(),
    code = randomInt(0, 1000000).toString().padStart(6, "0");
  tx(() => {
    run("UPDATE challenges SET consumed=1 WHERE session_id=?", s.id);
    run(
      "INSERT INTO challenges(id,email_hash,email_enc,code_hash,session_id,expires) VALUES(?,?,?,?,?,?)",
      cid,
      hash(e),
      seal(e),
      hash(cid + code),
      s.id,
      Date.now() + 900000,
    );
    enqueueMail(hash(e), {
      template: "otp",
      challengeId: cid,
      code,
      body: "15분 동안 유효한 1회용 로컬 시험 인증번호입니다. 실제 이메일은 발송되지 않습니다.",
    });
  });
  event("recovery_requested", cid);
  return cid;
}
export function localOtp(s: Session, cid: string) {
  requireLocalMailAccess();
  const c = one(
    "SELECT * FROM challenges WHERE id=? AND session_id=? AND consumed=0 AND expires>?",
    cid,
    s.id,
    Date.now(),
  );
  if (!c) throw new Fault("로컬 인증메일이 없습니다.", 404);
  const mail = all(
    "SELECT payload FROM outbox WHERE email_hash=? ORDER BY created DESC",
    c.email_hash,
  )
    .map((m) => open(m.payload))
    .find((m) => m.challengeId === cid);
  return mail;
}
export function verifyOtp(
  s: Session,
  cid: string,
  code: string,
  rotate = false,
) {
  limit("otp-verify:" + s.id, 15, 900000);
  const ok = tx(() => {
    const c = one(
      "SELECT * FROM challenges WHERE id=? AND session_id=?",
      cid,
      s.id,
    );
    if (!c || c.consumed || c.expires < Date.now() || c.attempts >= 5)
      return false;
    run("UPDATE challenges SET attempts=attempts+1 WHERE id=?", cid);
    if (hash(cid + code) !== c.code_hash) return false;
    run("UPDATE challenges SET consumed=1 WHERE id=?", cid);
    run(
      "UPDATE sessions SET email_hash=?,role='customer' WHERE id=?",
      c.email_hash,
      s.id,
    );
    run("DELETE FROM admin_auth WHERE session_id=?", s.id);
    run(
      "INSERT INTO session_auth VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET verified_at=excluded.verified_at",
      s.id,
      Date.now(),
    );
    if (rotate) {
      const next = newSession();
      run(
        "UPDATE sessions SET email_hash=? WHERE id=?",
        c.email_hash,
        next.session.id,
      );
      run(
        "UPDATE readings SET session_id=? WHERE session_id=?",
        next.session.id,
        s.id,
      );
      run(
        "UPDATE challenges SET session_id=? WHERE session_id=?",
        next.session.id,
        s.id,
      );
      run(
        "UPDATE session_auth SET session_id=? WHERE session_id=?",
        next.session.id,
        s.id,
      );
      run(
        "UPDATE email_changes SET session_id=? WHERE session_id=? AND old_hash=?",
        next.session.id,
        s.id,
        c.email_hash,
      );
      run("UPDATE email_changes SET state='canceled' WHERE session_id=?", s.id);
      run("DELETE FROM sessions WHERE id=?", s.id);
      return next.token;
    }
    return true;
  });
  if (!ok)
    throw new Fault(
      "인증번호가 틀렸거나 만료되었습니다. 새 번호를 요청해 주세요.",
      400,
    );
  return typeof ok === "string" ? ok : undefined;
}
export function createOrder(s: Session, rid: string, consent: unknown) {
  requireEmail(s);
  const c = z
    .object({
      terms: z.literal(true),
      privacy: z.literal(true),
      withdrawal: z.literal(true),
      confirmedBirth: z.literal(true),
      buyerAdult: z.literal(true, {
        error: "구매자 본인이 만 19세 이상인지 확인해 주세요.",
      }),
      marketing: z.boolean().default(false),
    })
    .parse(consent);
  const r = readingFor(s, rid);
  if (
    r.age_category === "14-18" ||
    r.age_category === "under14" ||
    (r.input.self && ageAtKstDate(r.chart.solarDate) < 19)
  )
    throw new Fault(
      "만 14~18세는 무료 풀이만 가능합니다. 보호자 확인 절차 준비 전에는 구매할 수 없습니다.",
      403,
    );
  const verified = one(
    "SELECT email_enc FROM challenges WHERE session_id=? AND consumed=1 AND email_hash=? ORDER BY expires DESC",
    s.id,
    s.email_hash,
  );
  if (!verified) throw new Fault("이메일을 다시 인증해 주세요.", 401);
  return tx(() => {
    const existing = one(
      "SELECT id,amount FROM orders WHERE reading_id=? AND email_hash=?",
      rid,
      s.email_hash,
    );
    if (existing) {
      if (existing.amount !== PRODUCT_PRICE_KRW)
        throw new Fault(
          "판매가가 변경되었습니다. 새 무료풀이에서 현재 가격으로 주문해 주세요. 기존 구매 내역은 다시 찾기에서 확인할 수 있습니다.",
          409,
        );
      return existing.id as string;
    }
    const oid = id();
    run(
      "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,created,consent_enc) VALUES(?,?,?,?,?,?,?,?,?)",
      oid,
      rid,
      s.email_hash,
      verified.email_enc,
      PRODUCT_PRICE_KRW,
      "pending",
      "waiting",
      Date.now(),
      seal({
        ...c,
        policy:
          process.env.SALES_MODE === "live"
            ? "sales-2026-11-26-ai-v1"
            : "draft-2026-11-14-age-v2",
        ...(process.env.SALES_MODE === "live"
          ? { aiTransferConsent: c.privacy, mailTransferConsent: c.privacy }
          : {}),
        time: Date.now(),
        product: "2027-v2",
        priceKrw: PRODUCT_PRICE_KRW,
        age: "19+",
        ageEvidence: "checkout-self-declaration",
      }),
    );
    run("INSERT INTO reading_history VALUES(?,?,?)", oid, rid, 1);
    event("checkout_open", oid);
    return oid;
  });
}
export function ownOrder(s: Session, oid: string) {
  requireEmail(s);
  const o = one(
    "SELECT * FROM orders WHERE id=? AND email_hash=?",
    oid,
    s.email_hash,
  );
  if (!o) throw new Fault("주문을 찾을 수 없습니다.", 404);
  return o;
}
export function mockAuthenticate(
  s: Session,
  oid: string,
  scenario = "success",
) {
  const o = ownOrder(s, oid);
  requireMockPayment(oid);
  if (o.content_deleted)
    throw new Fault("삭제된 주문은 결제할 수 없습니다.", 409);
  if (one("SELECT order_id FROM toss_attempts WHERE order_id=?", oid))
    throw new Fault("테스트 PG 주문은 전용 승인 경로로 확인해야 합니다.", 409);
  if (o.payment_status !== "pending") return o.payment_key;
  if (scenario === "decline")
    throw new Fault("모의 결제가 거절되었습니다. 청구되지 않았습니다.");
  const key = "mock_" + id();
  return tx(() => {
    const old = one("SELECT * FROM pg_ledger WHERE order_id=?", oid);
    if (old) return old.payment_key;
    run(
      "INSERT INTO pg_ledger(payment_key,order_id,amount,status) VALUES(?,?,?,?)",
      key,
      oid,
      o.amount,
      "DONE",
    );
    event("payment_initiated", oid);
    return key;
  });
}
export function confirmPayment(
  s: Session,
  oid: string,
  key: string,
  amount: number,
  failAfterPg = false,
) {
  const o = ownOrder(s, oid);
  requireMockPayment(oid);
  if (one("SELECT order_id FROM toss_attempts WHERE order_id=?", oid))
    throw new Fault("테스트 PG 주문은 전용 승인 경로로 확인해야 합니다.", 409);
  if (!isSupportedOrderAmount(o.amount) || amount !== o.amount)
    throw new Fault("주문금액 검증에 실패했습니다.");
  const pg = one(
    "SELECT * FROM pg_ledger WHERE payment_key=? AND order_id=?",
    key,
    oid,
  );
  if (!pg || pg.amount !== o.amount || pg.status !== "DONE")
    throw new Fault("결제 승인 사실을 확인할 수 없습니다.");
  if (failAfterPg) throw Error("SIMULATED_DB_FAILURE");
  finalizePayment(oid, key);
}
function finalizePayment(oid: string, key: string) {
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", oid);
    if (!o || o.payment_status !== "pending") return;
    const verified = one(
      "SELECT approved_at FROM toss_attempts WHERE order_id=? AND payment_key=? AND state='verified'",
      oid,
      key,
    );
    const now = verified?.approved_at ?? Date.now(),
      expiry = new Date(now);
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    const deliverable = !o.content_deleted && expiry.getTime() > Date.now();
    run(
      "UPDATE orders SET payment_status='paid',fulfillment=?,payment_key=?,paid_at=?,expires=? WHERE id=?",
      deliverable ? "queued" : "failed",
      key,
      now,
      expiry.getTime(),
      oid,
    );
    if (deliverable)
      run(
        "INSERT OR IGNORE INTO jobs(id,order_id,version,state,scheduled) VALUES(?,?,?,?,?)",
        id(),
        oid,
        o.version,
        "queued",
        now,
      );
    else audit("system", "verified_payment_requires_fulfillment_review", oid);
    event("payment_confirmed", oid);
    audit("system", "payment_verified", oid);
    enqueueMail(o.email_hash, {
      template: "payment_confirmed",
      orderId: oid,
      amount: o.amount,
      body: "모의 결제 확인. 운명서 작성 상태는 다시 찾기에서 확인할 수 있습니다.",
    });
  });
}
export function reconcile() {
  const pending = all(
    "SELECT o.id,p.payment_key FROM orders o JOIN pg_ledger p ON p.order_id=o.id WHERE o.payment_status='pending' AND p.status='DONE' AND o.amount=p.amount",
  );
  for (const p of pending) finalizePayment(p.id, p.payment_key);
  tx(() => {
    for (const o of repairMissingJobs()) {
      run(
        "INSERT OR IGNORE INTO jobs(id,order_id,version,state,scheduled) VALUES(?,?,?,?,?)",
        id(),
        o.id,
        o.version,
        "queued",
        Date.now(),
      );
      run("UPDATE orders SET fulfillment='queued' WHERE id=?", o.id);
      audit("system", "missing_job_repaired", o.id);
    }
  });
}
type ReportJob = Record<string, any>;
function claimReportJob(
  orderId?: string,
  lane: GenerationLane = "mock",
): ReportJob | null {
  if (!["mock", "openai"].includes(lane))
    throw Error("INVALID_GENERATION_LANE");
  workerHeartbeat();
  reconcile();
  return tx(() => {
    // A restored AI enrollment also blocks mock fallback while orders/usage are reconciled.
    if (
      one(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_worker_enrollment'",
      ) &&
      one("SELECT recovery_hold FROM ai_worker_enrollment WHERE id=1")
        ?.recovery_hold !== 0
    )
      return null;
    if (
      one(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='toss_live_enrollment'",
      ) &&
      one("SELECT recovery_hold FROM toss_live_enrollment WHERE id=1")
        ?.recovery_hold !== 0
    )
      return null;
    const now = Date.now();
    const j = one(
      "SELECT j.* FROM jobs j JOIN orders o ON o.id=j.order_id LEFT JOIN order_generation_lanes l ON l.order_id=o.id WHERE COALESCE(l.provider,'mock')=? AND o.payment_status='paid' AND o.content_deleted=0 AND o.expires>? AND (? IS NULL OR o.id=?) AND j.version=o.version AND ((j.state IN ('queued','retrying') AND j.scheduled<=?) OR (j.state='running' AND j.lease_until<?)) ORDER BY j.scheduled LIMIT 1",
      lane,
      now,
      orderId ?? null,
      orderId ?? null,
      now,
      now,
    );
    if (!j) return null;
    run(
      "UPDATE jobs SET state='running',attempts=attempts+1,lease_until=? WHERE id=?",
      now +
        (lane === "openai" && process.env.AI_REPORT_PROFILE === "rich-ko-v1"
          ? 180000
          : 60000),
      j.id,
    );
    run("UPDATE orders SET fulfillment='generating' WHERE id=?", j.order_id);
    return { ...j, attempts: j.attempts + 1 };
  });
}
function reportJobContext(job: ReportJob) {
  const order = one("SELECT * FROM orders WHERE id=?", job.order_id)!;
  const reading = one("SELECT * FROM readings WHERE id=?", order.reading_id)!;
  return { order, chart: open<Chart>(reading.chart_enc) };
}
function publishReportJob(
  job: ReportJob,
  o: ReportJob,
  chart: Chart,
  raw: unknown,
) {
  const report = validateReport(raw, chart);
  return tx(() => {
    const lease = one(
      "SELECT state,attempts,lease_until FROM jobs WHERE id=?",
      job.id,
    );
    if (
      lease?.state !== "running" ||
      lease.attempts !== job.attempts ||
      lease.lease_until <= Date.now()
    )
      return false;
    const current = one("SELECT * FROM orders WHERE id=?", o.id);
    if (
      current?.payment_status !== "paid" ||
      current.version !== job.version ||
      current.content_deleted ||
      current.expires < Date.now()
    ) {
      run("UPDATE jobs SET state='canceled' WHERE id=?", job.id);
      return false;
    }
    const inserted = run(
      "INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?)",
      id(),
      o.id,
      job.version,
      seal(report),
      Date.now(),
    );
    run(
      "DELETE FROM ai_generation_evidence WHERE order_id=? AND version=?",
      o.id,
      job.version,
    );
    if (inserted.changes)
      run(
        "INSERT OR IGNORE INTO report_usage VALUES(?,?,?,?,?,?)",
        o.id,
        job.version,
        report.provider,
        report.usage.inputTokens,
        report.usage.outputTokens,
        report.usage.estimatedUsdMicros ??
          (report.provider === "local-rule-mock" ? 0 : null),
      );
    run(
      "UPDATE jobs SET state='done',lease_until=NULL,error=NULL WHERE id=?",
      job.id,
    );
    run("UPDATE orders SET fulfillment='ready' WHERE id=?", o.id);
    enqueueMail(o.email_hash, {
      template: "report_ready",
      orderId: o.id,
      body: "운명서가 준비되었습니다. 이메일 인증으로 1년 무료 재열람과 PDF 저장이 가능합니다.",
    });
    event("report_ready", o.id);
    return true;
  });
}
export function generationFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    !/^(?:AI_[A-Z0-9_]{2,70}|UNSAFE_AI_CONTENT|UNSAFE_CONTENT|UNCERTAINTY_REMOVED|CHART_CHANGED|DUPLICATE_CHAPTER|UNSUPPORTED_FACT|COUNT_FACT_MISMATCH|REPORT_[A-Z0-9_]{2,65}|DAY_FACT_MISMATCH|UNSUPPORTED_PILLAR)$/.test(
      message,
    )
  )
    return "GENERATION_UNAVAILABLE";
  const status =
    typeof error === "object" && error !== null && "httpStatus" in error
      ? Number(error.httpStatus)
      : 0;
  return (
    message +
    (Number.isInteger(status) && status >= 100 && status <= 599
      ? "_HTTP_" + status
      : "")
  );
}
function failReportJob(job: ReportJob, error?: unknown) {
  tx(() => {
    const lease = one(
      "SELECT state,attempts,lease_until FROM jobs WHERE id=?",
      job.id,
    );
    if (
      lease?.state !== "running" ||
      lease.attempts !== job.attempts ||
      lease.lease_until <= Date.now()
    )
      return;
    const current = one("SELECT * FROM orders WHERE id=?", job.order_id);
    if (
      !current ||
      current.payment_status !== "paid" ||
      current.version !== job.version ||
      current.content_deleted ||
      current.expires <= Date.now()
    ) {
      run(
        "UPDATE jobs SET state='canceled',lease_until=NULL WHERE id=?",
        job.id,
      );
      return;
    }
    const exhausted = job.attempts >= 4;
    run(
      "UPDATE jobs SET state=?,error=?,scheduled=?,lease_until=NULL WHERE id=?",
      exhausted ? "failed" : "retrying",
      generationFailureCode(error),
      Date.now() + Math.min(60000, 1000 * 2 ** job.attempts),
      job.id,
    );
    run(
      "UPDATE orders SET fulfillment=? WHERE id=?",
      exhausted ? "failed" : "retrying",
      job.order_id,
    );
    if (exhausted) {
      audit("system", "generation_failed_alert", job.order_id);
      const o = one("SELECT email_hash FROM orders WHERE id=?", job.order_id)!;
      enqueueMail(o.email_hash, {
        template: "generation_failed",
        orderId: job.order_id,
        body: "결제는 확인되었으나 작성에 실패했습니다. 고객센터에서 복구 또는 환불을 신청할 수 있습니다.",
      });
    }
  });
}
export function workOnce(failGeneration = false) {
  const job = claimReportJob();
  if (!job) return false;
  try {
    const { order, chart } = reportJobContext(job);
    if (failGeneration) throw Error("MOCK_AI_TIMEOUT");
    publishReportJob(job, order, chart, generate(chart));
  } catch {
    failReportJob(job);
  }
  return true;
}
/** Injectable asynchronous generation. Normal routes do not invoke providers; the enrolled worker can select the AI lane.
 * The live synthetic harness supplies a chart-pinned transport in an isolated DB.
 */
export async function workOnceWithGenerator(
  generator: (
    chart: Chart,
    context: Readonly<{ orderId: string; version: number }>,
  ) => Promise<Report>,
  orderId?: string,
  lane: GenerationLane = "mock",
) {
  const job = claimReportJob(orderId, lane);
  if (!job) return false;
  try {
    const { order, chart } = reportJobContext(job);
    publishReportJob(
      job,
      order,
      chart,
      await generator(
        chart,
        Object.freeze({ orderId: order.id, version: order.version }),
      ),
    );
  } catch (error) {
    failReportJob(job, error);
  }
  return true;
}

export function orderView(o: Record<string, any>) {
  return {
    id: o.id,
    livePayment: isLiveTossOrder(o.id),
    amount: o.amount,
    payment: o.payment_status,
    fulfillment: o.fulfillment,
    generationHeld:
      ["retrying", "failed"].includes(o.fulfillment) &&
      hasAiReservation(db(), o.id, o.version),
    expires: o.expires,
    version: o.version,
    created: o.created,
    deleted: Boolean(o.content_deleted),
  };
}
export function listOrders(s: Session) {
  requireEmail(s);
  return all(
    "SELECT * FROM orders WHERE email_hash=? ORDER BY created DESC",
    s.email_hash,
  ).map(orderView);
}
export function getReport(s: Session, oid: string) {
  const o = ownOrder(s, oid);
  if (o.payment_status !== "paid" || o.fulfillment !== "ready")
    throw new Fault("결제·운명서 제공 상태를 확인해 주세요.", 403);
  if (!o.expires || o.expires < Date.now())
    throw new Fault(
      "무료 재열람 기간이 종료되었습니다. 고객센터로 문의해 주세요.",
      410,
    );
  if (o.content_deleted) throw new Fault("삭제된 운명서입니다.", 410);
  const r = one(
    "SELECT * FROM reports WHERE order_id=? AND version=?",
    oid,
    o.version,
  );
  if (!r) throw new Fault("운명서 복구가 필요합니다.", 503);
  const source = one(
    "SELECT input_enc FROM readings WHERE id=?",
    o.reading_id,
  )!;
  const b = open(source.input_enc);
  if (!b) throw new Fault("삭제된 운명서입니다.", 410);
  event("report_open", oid);
  return {
    id: r.id,
    order: orderView(o),
    name: b.name,
    birth: b,
    created: r.created,
    report: open<Report>(r.payload),
  };
}
export function resend(s: Session, oid: string) {
  const o = ownOrder(s, oid);
  limit("mail:" + oid, 3, 3600000);
  enqueueMail(o.email_hash, {
    template: "report_link",
    orderId: oid,
    body: "이메일 인증 후 같은 운명서를 열람하세요. PDF 공개 첨부는 제공하지 않습니다.",
  });
  audit(s.id, "mail_resend_local", oid);
}
export function ticket(s: Session, raw: unknown) {
  requireEmail(s);
  const t = z
    .object({
      orderId: z.string().uuid().optional(),
      category: z.enum([
        "refund",
        "correction",
        "email",
        "privacy",
        "guardian",
        "other",
      ]),
      message: z.string().trim().min(5).max(2000),
    })
    .parse(raw);
  if (t.orderId) ownOrder(s, t.orderId);
  limit("help:" + s.id, 10);
  return tx(() => {
    const tid = id(),
      now = Date.now();
    run(
      "INSERT INTO tickets(id,email_hash,order_id,category,payload,created,due) VALUES(?,?,?,?,?,?,?)",
      tid,
      s.email_hash,
      t.orderId || null,
      t.category,
      seal({ message: t.message }),
      now,
      now + 3 * 86400000,
    );
    snapshotTicketContact(tid, s.email_hash!);
    event(t.category === "refund" ? "refund_requested" : "support_ticket", tid);
    return tid;
  });
}
export function getTickets(s: Session) {
  requireEmail(s);
  return all(
    "SELECT * FROM tickets WHERE email_hash=? ORDER BY created DESC",
    s.email_hash,
  ).map((t) => ({
    id: t.id,
    orderId: t.order_id,
    category: t.category,
    status: t.status,
    created: t.created,
    due: t.due,
    ...open(t.payload),
  }));
}
export function adminRequired(
  s: Session,
  roles = ["operations", "finance", "support"],
) {
  const current = one("SELECT role,expires FROM sessions WHERE id=?", s.id);
  if (
    !current ||
    current.expires <= Date.now() ||
    !roles.includes(current.role)
  )
    throw new Fault("관리자 권한이 필요합니다.", 403);
}
export function adminOverview(s: Session, query = "") {
  adminRequired(s);
  if (!/^[a-fA-F0-9-]{0,36}$/.test(query))
    throw new Fault("주문번호의 앞부분을 입력해 주세요.");
  const orders = all(
    "SELECT * FROM orders WHERE id LIKE ? ORDER BY created DESC LIMIT 200",
    query + "%",
  ).map((o) => ({
    ...orderView(o),
    email: `${o.email_hash.slice(0, 8)}…`,
    corrections: o.corrections,
  }));
  return {
    orders,
    aiSpendReview: aiSpendReview(db()),
    tickets: all("SELECT * FROM tickets ORDER BY created DESC LIMIT 100").map(
      (t) => ({
        id: t.id,
        orderId: t.order_id,
        category: t.category,
        status: t.status,
        created: t.created,
        due: t.due,
        ...open(t.payload),
      }),
    ),
    jobs: all(
      "SELECT id,order_id,state,attempts,error,scheduled FROM jobs ORDER BY scheduled DESC LIMIT 100",
    ),
    refunds: all(
      "SELECT id,order_id,amount,status,created,resolved FROM refunds ORDER BY created DESC LIMIT 100",
    ),
    audit: all("SELECT * FROM audit ORDER BY id DESC LIMIT 100"),
    events: all("SELECT event,count(*) AS count FROM events GROUP BY event"),
    metrics: {
      gross: one(
        "SELECT COALESCE(SUM(amount),0) AS amount FROM orders WHERE payment_status IN ('paid','refund_pending','refunded')",
      )!.amount,
      refunds: one(
        "SELECT COALESCE(SUM(amount),0) AS amount FROM orders WHERE payment_status='refunded'",
      )!.amount,
      aiSavedReports: one(
        "SELECT count(*) n FROM report_usage WHERE provider='openai'",
      )!.n,
      aiInputTokens: one(
        "SELECT COALESCE(sum(input_tokens),0) n FROM report_usage WHERE provider='openai'",
      )!.n,
      aiOutputTokens: one(
        "SELECT COALESCE(sum(output_tokens),0) n FROM report_usage WHERE provider='openai'",
      )!.n,
      aiEstimateUsdMicros: one(
        "SELECT COALESCE(sum(estimated_usd_micros),0) n FROM report_usage WHERE provider='openai'",
      )!.n,
      aiUnknownEstimates: one(
        "SELECT count(*) n FROM report_usage WHERE provider='openai' AND estimated_usd_micros IS NULL",
      )!.n,
      aiUnindexedReports: one(
        "SELECT count(*) n FROM reports r LEFT JOIN report_usage u ON u.order_id=r.order_id AND u.version=r.version WHERE u.order_id IS NULL",
      )!.n,
      pgCostKrw: 0,
      mode: "local mock; 실제 매출 아님",
    },
    health: operationalHealth(),
    mailDeliveries: all(
      "SELECT outbox_id,template,state,attempts,failures,scheduled,last_error FROM mail_queue ORDER BY updated DESC LIMIT 50",
    ),
    mailHealth: mailQueueHealth(db()),
    mailCount: one("SELECT count(*) AS n FROM outbox")!.n,
  };
}
export function adminRetry(s: Session, oid: string) {
  requireRecentAdmin(s, ["operations"]);
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", oid);
    if (
      !o ||
      o.content_deleted ||
      o.payment_status !== "paid" ||
      o.expires <= Date.now() ||
      o.fulfillment === "ready"
    )
      throw new Fault("재처리 대상 주문이 아닙니다.");
    if (hasAiReservation(db(), oid, o.version))
      throw new Fault(
        "AI 요청 기록이 있어 재시도를 중단했습니다. 제공자 처리 내역과 기존 보고서를 먼저 확인해 주세요.",
      );
    run(
      "INSERT OR IGNORE INTO jobs(id,order_id,version,state,scheduled) VALUES(?,?,?,?,?)",
      id(),
      oid,
      o.version,
      "queued",
      Date.now(),
    );
    run(
      "UPDATE jobs SET state='queued',attempts=0,scheduled=?,error=NULL,lease_until=NULL WHERE order_id=? AND version=?",
      Date.now(),
      oid,
      o.version,
    );
    run("UPDATE orders SET fulfillment='queued' WHERE id=?", oid);
    audit(s.id, "generation_retry", oid);
  });
}
export function refund(
  s: Session,
  oid: string,
  reason: string,
  pgFailure = false,
) {
  requireRecentAdmin(s, ["operations", "finance"]);
  requireMockPayment(oid);
  if (one("SELECT order_id FROM toss_attempts WHERE order_id=?", oid))
    throw new Fault("테스트 PG 주문은 전용 취소 경로로 처리해야 합니다.", 409);
  if (reason.trim().length < 5)
    throw new Fault("환불 검토 사유를 5자 이상 기록해 주세요.");
  const o = one("SELECT * FROM orders WHERE id=?", oid);
  if (!o) throw new Fault("주문이 없습니다.", 404);
  if (o.payment_status === "refunded") return;
  if (!["paid", "refund_pending"].includes(o.payment_status))
    throw new Fault("환불 가능한 결제가 없습니다.");
  tx(() => {
    run(
      "INSERT OR IGNORE INTO refunds(id,order_id,amount,reason_enc,status,created) VALUES(?,?,?,?,?,?)",
      id(),
      oid,
      o.amount,
      seal({ reason, actor: s.id }),
      "pending",
      Date.now(),
    );
    run("UPDATE orders SET payment_status='refund_pending' WHERE id=?", oid);
    audit(s.id, "refund_requested", oid);
  });
  if (pgFailure) {
    run("UPDATE refunds SET status='error' WHERE order_id=?", oid);
    throw new Fault("PG 모의 취소 실패: 환불 대기 상태를 유지합니다.", 503);
  }
  const ledger = one("SELECT * FROM pg_ledger WHERE order_id=?", oid);
  if (
    !ledger ||
    ledger.amount !== o.amount ||
    ledger.payment_key !== o.payment_key ||
    !["DONE", "CANCELED"].includes(ledger.status)
  ) {
    run("UPDATE refunds SET status='error' WHERE order_id=?", oid);
    throw new Fault(
      "환불 결제 원장 대조에 실패했습니다. 관리자 확인이 필요합니다.",
      503,
    );
  }
  const cancel = id();
  run(
    "UPDATE pg_ledger SET status='CANCELED',cancel_id=COALESCE(cancel_id,?) WHERE order_id=?",
    cancel,
    oid,
  );
  finalizeRefund(oid);
}
function finalizeRefund(oid: string) {
  tx(() => {
    const pg = one(
      "SELECT * FROM pg_ledger WHERE order_id=? AND status='CANCELED'",
      oid,
    );
    if (!pg) return;
    const o = one("SELECT * FROM orders WHERE id=?", oid)!;
    if (o.payment_status === "refunded") return;
    const refund = one("SELECT amount FROM refunds WHERE order_id=?", oid);
    if (
      !refund ||
      refund.amount !== o.amount ||
      pg.amount !== o.amount ||
      pg.payment_key !== o.payment_key ||
      !pg.cancel_id
    )
      return;
    run("UPDATE orders SET payment_status='refunded' WHERE id=?", oid);
    run(
      "UPDATE refunds SET status='completed',cancel_id=?,resolved=? WHERE order_id=?",
      pg.cancel_id,
      Date.now(),
      oid,
    );
    run(
      "UPDATE jobs SET state='canceled' WHERE order_id=? AND state!='done'",
      oid,
    );
    event("refund_completed", oid);
    audit("system", "refund_verified_access_revoked", oid);
    enqueueMail(o.email_hash, {
      template: "refund_completed",
      orderId: oid,
      body:
        (isLiveTossOrder(oid)
          ? "전액 취소가 확인되었습니다."
          : "모의 전액 취소가 확인되었습니다.") +
        " 웹 재열람 권한은 종료됩니다. 이미 저장한 파일의 원격 삭제를 뜻하지 않습니다.",
    });
  });
}
export function reconcileRefunds() {
  for (const o of all(
    "SELECT id FROM orders WHERE payment_status='refund_pending'",
  ))
    finalizeRefund(o.id);
}
export function correctBirth(
  s: Session,
  oid: string,
  raw: unknown,
  reason: string,
) {
  requireRecentAdmin(s, ["operations"]);
  if (reason.trim().length < 5)
    throw new Fault("본인확인·정정 사유를 기록해 주세요.");
  const o = one("SELECT * FROM orders WHERE id=?", oid);
  if (
    !o ||
    o.payment_status !== "paid" ||
    o.content_deleted ||
    o.expires <= Date.now() ||
    o.corrections >= 1 ||
    Date.now() - o.paid_at > 7 * 86400000
  )
    throw new Fault(
      "7일 이내 1회 정정 대상인지 확인해 주세요. 법정권리는 별도 문의로 검토합니다.",
    );
  const b = birthSchema.parse(raw);
  if (b.age !== "19+")
    throw new Fault(
      "구매자 연령 변경으로 구매 제한을 우회할 수 없습니다.",
      403,
    );
  const c = calculate(b);
  assertSubjectAge(c.solarDate);
  if (ageAtKstDate(c.solarDate) < 19)
    throw new Fault("정정으로 미성년 구매 제한을 우회할 수 없습니다.", 403);
  const old = one("SELECT * FROM readings WHERE id=?", o.reading_id)!;
  tx(() => {
    const rid = id(),
      v = o.version + 1;
    run(
      "INSERT INTO readings VALUES(?,?,?,?,?,?,?)",
      rid,
      old.session_id,
      old.age_category,
      seal(b),
      seal(c),
      seal(preview(c)),
      Date.now(),
    );
    run(
      "UPDATE orders SET reading_id=?,version=?,corrections=1,fulfillment='queued' WHERE id=?",
      rid,
      v,
      oid,
    );
    run("INSERT INTO reading_history VALUES(?,?,?)", oid, rid, v);
    run(
      "UPDATE jobs SET state='canceled' WHERE order_id=? AND state!='done'",
      oid,
    );
    run(
      "INSERT INTO jobs(id,order_id,version,state,scheduled) VALUES(?,?,?,?,?)",
      id(),
      oid,
      v,
      "queued",
      Date.now(),
    );
    audit(s.id, "birth_corrected_identity_reviewed", oid);
  });
}
export function adminResend(s: Session, oid: string) {
  adminRequired(s);
  const o = one("SELECT * FROM orders WHERE id=?", oid);
  if (!o) throw new Fault("주문이 없습니다.", 404);
  limit("admin-mail:" + oid, 5);
  enqueueMail(o.email_hash, {
    template: "report_link",
    orderId: oid,
    body: "안전한 이메일 인증 후 운명서를 다시 열람할 수 있습니다.",
  });
  audit(s.id, "admin_mail_resend_local", oid);
}
export function answerTicket(s: Session, tid: string, message: string) {
  adminRequired(s);
  if (message.trim().length < 5 || message.length > 2000)
    throw new Fault("답변은 5~2000자로 작성해 주세요.");
  const t = one("SELECT * FROM tickets WHERE id=?", tid);
  if (!t) throw new Fault("문의가 없습니다.", 404);
  run(
    "UPDATE tickets SET status='answered',payload=? WHERE id=?",
    seal({ ...open<Record<string, unknown>>(t.payload), answer: message }),
    tid,
  );
  audit(s.id, "ticket_answered", tid);
  enqueueMail(t.email_hash, {
    template: "support_answered",
    ticketId: tid,
    body: "문의 답변이 등록되었습니다. 인증 후 고객센터에서 확인하세요.",
  });
}
export function deleteContent(
  s: Session,
  oid: string,
  ticketId: string,
  reason: string,
) {
  requireRecentAdmin(s, ["operations"]);
  if (reason.trim().length < 5)
    throw new Fault("삭제 검토 근거를 기록해 주세요.");
  const t = one(
    "SELECT * FROM tickets WHERE id=? AND category='privacy'",
    ticketId,
  );
  const o = t
    ? one("SELECT * FROM orders WHERE id=? AND email_hash=?", oid, t.email_hash)
    : null;
  if (!o) throw new Fault("본인 인증된 삭제 문의와 주문을 대조해 주세요.");
  tx(() => {
    wipeContent(oid);
    audit(s.id, "content_deleted_transaction_retained", oid);
    run(
      "UPDATE tickets SET status='answered',payload=? WHERE id=?",
      seal({
        ...open<Record<string, unknown>>(t!.payload),
        answer:
          "운명서·출생정보를 삭제했습니다. 법적 근거 검토 대상 거래기록은 분리 보존합니다.",
      }),
      ticketId,
    );
  });
}
function wipeContent(oid: string) {
  run("DELETE FROM ai_generation_evidence WHERE order_id=?", oid);
  run("DELETE FROM reports WHERE order_id=?", oid);
  for (const r of all(
    "SELECT reading_id FROM reading_history WHERE order_id=?",
    oid,
  ))
    run(
      "UPDATE readings SET input_enc=?,chart_enc=?,preview_enc=? WHERE id=?",
      seal(null),
      seal(null),
      seal(null),
      r.reading_id,
    );
  run("UPDATE jobs SET state='canceled' WHERE order_id=?", oid);
  run("UPDATE orders SET content_deleted=1 WHERE id=?", oid);
  run("INSERT OR IGNORE INTO deletion_tombstones VALUES(?,?)", oid, Date.now());
}
export function purgeExpired() {
  const now = Date.now();
  tx(() => {
    run("DELETE FROM visits WHERE first_seen<?", now - 30 * 86400000);
    run("DELETE FROM visit_exclusions WHERE expires<?", now);
    for (const o of all(
      "SELECT id FROM orders WHERE expires<? AND content_deleted=0",
      now,
    )) {
      wipeContent(o.id);
    }
    run("DELETE FROM sessions WHERE expires<?", now);
    run("DELETE FROM challenges WHERE expires<?", now - 86400000);
    run("DELETE FROM email_changes WHERE expires<?", now - 86400000);
    run(
      "DELETE FROM outbox WHERE id IN (SELECT outbox_id FROM mail_queue WHERE template IN ('otp','email_change_otp')) AND created<?",
      now - 86400000,
    );
    run("DELETE FROM outbox WHERE created<?", now - 7 * 86400000);
    run("DELETE FROM rate_limits WHERE reset<?", now);
    run(
      "DELETE FROM readings WHERE created<? AND id NOT IN (SELECT reading_id FROM reading_history)",
      now - 86400000,
    );
  });
}
