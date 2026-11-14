/** Provider-neutral offline delivery core. Intentionally not registered in the app/worker. */
import { z } from "zod";
import { all, one, run, tx } from "./db";
import { audit, Fault, hash, limit, open, seal } from "./security";
import { contactFor } from "./mail-records";
import {
  mailDeadline,
  mailPayload,
  mailProfileSchema,
  renderMail,
  type MailEnvelope,
  type MailProfile,
} from "./mail-content";
import {
  blockedMailGateway,
  type MailGateway,
  type MailEvidence,
} from "./integrations/mail-gateway";
const providerId = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => !/[\x00-\x1f\x7f]/.test(s));
const receipt = z.object({
  key: z.string().min(1).max(100),
  state: z.enum([
    "unknown",
    "not_sent",
    "accepted",
    "delivered",
    "bounced",
    "complained",
  ]),
  providerId: providerId.optional(),
  authoritative: z.boolean().optional(),
  permanent: z.boolean().optional(),
});
type Claim = {
  id: string;
  generation: number;
  action: "send" | "lookup";
  notificationId: number;
  failures: number;
};
export class MailDeliveryCoordinator {
  private profile: MailProfile;
  private digest: string;
  private timeoutMs: number;
  constructor(
    profile: MailProfile,
    private gateway: MailGateway = blockedMailGateway,
    options: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 15000
    )
      throw Error("INVALID_MAIL_TIMEOUT");
    this.profile = mailProfileSchema.parse(profile);
    const url = new URL(profile.origin);
    if (
      url.origin !== profile.origin ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
    )
      throw Error("INVALID_MAIL_ORIGIN");
    z.string()
      .regex(/^[a-zA-Z0-9_-]{1,60}$/)
      .parse(gateway.name);
    if (
      !Number.isFinite(gateway.idempotencyWindowMs) ||
      gateway.idempotencyWindowMs < 0 ||
      gateway.idempotencyWindowMs > 15 * 86400000
    )
      throw Error("INVALID_MAIL_RETRY_WINDOW");
    this.digest = hash(
      JSON.stringify({ version: 1, ...this.profile, provider: gateway.name }),
    );
  }
  prepare(id: string) {
    return tx(() => {
      const q = one("SELECT * FROM mail_queue WHERE outbox_id=?", id),
        o = one("SELECT * FROM outbox WHERE id=?", id);
      if (!q || !o) throw new Fault("발송 기록이 없습니다.", 404);
      if (q.profile_digest && q.profile_digest !== this.digest)
        throw new Fault("이미 준비한 발송 설정과 다릅니다.", 409);
      if (q.profile_digest) return { state: q.state };
      const parsed = mailPayload.safeParse(open(o.payload));
      if (!parsed.success) {
        this.setState(id, "blocked", "UNSUPPORTED_TEMPLATE");
        return { state: "blocked" };
      }
      const deadline = mailDeadline(parsed.data, o.email_hash, o.created);
      if (!deadline || deadline <= Date.now()) {
        this.setState(id, "canceled", "STALE_MESSAGE");
        return { state: "canceled" };
      }
      const to =
        open<string | null>(q.recipient_enc) ?? contactFor(o.email_hash);
      if (!to || hash(to) !== o.email_hash) {
        this.setState(id, "blocked", "MISSING_CONTACT");
        return { state: "blocked" };
      }
      if (
        one(
          "SELECT reason FROM mail_suppressions WHERE email_hash=?",
          o.email_hash,
        )
      ) {
        this.setState(id, "blocked", "MAIL_SUPPRESSED");
        return { state: "blocked" };
      }
      const message = renderMail(parsed.data, to, this.profile, deadline);
      run(
        "UPDATE mail_queue SET recipient_enc=?,message_enc=?,profile_digest=?,deadline=?,state=?,scheduled=?,last_error=NULL,updated=? WHERE outbox_id=?",
        seal(to),
        seal(message),
        this.digest,
        deadline,
        q.recovery_hold ? "review" : "queued",
        Date.now(),
        Date.now(),
        id,
      );
      return { state: q.recovery_hold ? "review" : "queued" };
    });
  }
  private setState(id: string, state: string, error: string | null) {
    run(
      "UPDATE mail_queue SET state=?,last_error=?,lease_until=0,updated=? WHERE outbox_id=?",
      state,
      error,
      Date.now(),
      id,
    );
  }
  private claim(id: string, forceLookup = false): Claim | null {
    return tx(() => {
      const q = one(
          "SELECT * FROM mail_queue WHERE outbox_id=? AND profile_digest=?",
          id,
          this.digest,
        ),
        o = one("SELECT * FROM outbox WHERE id=?", id);
      if (!q || !o || q.lease_until > Date.now()) return null;
      const action = forceLookup
        ? "lookup"
        : q.state === "queued" || q.state === "retrying"
          ? "send"
          : "lookup";
      if (action === "send") {
        const parsed = mailPayload.safeParse(open(o.payload));
        const deadline = parsed.success
          ? mailDeadline(parsed.data, o.email_hash, o.created)
          : null;
        if (!deadline || deadline <= Date.now() || q.deadline <= Date.now()) {
          this.setState(id, "canceled", "STALE_MESSAGE");
          return null;
        }
        if (
          one(
            "SELECT reason FROM mail_suppressions WHERE email_hash=?",
            o.email_hash,
          )
        ) {
          this.setState(id, "blocked", "MAIL_SUPPRESSED");
          return null;
        }
        if (
          q.first_dispatched &&
          Date.now() - q.first_dispatched >= this.gateway.idempotencyWindowMs
        ) {
          this.setState(id, "review", "IDEMPOTENCY_WINDOW_EXPIRED");
          return null;
        }
      }
      run(
        "UPDATE mail_queue SET generation=generation+1,attempts=attempts+1,lease_until=?,needs_check=0,state=?,first_dispatched=CASE WHEN ?='send' THEN COALESCE(first_dispatched,?) ELSE first_dispatched END,updated=? WHERE outbox_id=?",
        Date.now() + 30000,
        action === "send" ? "sending" : q.state,
        action,
        Date.now(),
        Date.now(),
        id,
      );
      return {
        id,
        generation: q.generation + 1,
        action,
        failures: q.failures,
        notificationId: Number(
          one(
            "SELECT COALESCE(MAX(id),0) n FROM mail_notifications WHERE outbox_id=?",
            id,
          )!.n,
        ),
      };
    });
  }
  private fail(c: Claim, code = "MAIL_TEMPORARILY_UNAVAILABLE") {
    run(
      "UPDATE mail_queue SET state=CASE WHEN state IN ('delivered','bounced','complained') THEN state WHEN failures>=5 THEN 'review' ELSE 'uncertain' END,lease_until=0,last_error=?,failures=failures+1,scheduled=?,needs_check=CASE WHEN failures>=5 THEN 0 ELSE 1 END,updated=? WHERE outbox_id=? AND generation=? AND lease_until>0",
      code,
      Date.now() + Math.min(60000, 1000 * 2 ** Math.min(c.failures + 1, 6)),
      Date.now(),
      c.id,
      c.generation,
    );
    return {
      state:
        one("SELECT state FROM mail_queue WHERE outbox_id=?", c.id)?.state ??
        "gone",
    };
  }
  private apply(c: Claim, raw: MailEvidence) {
    const r = receipt.parse(raw);
    if (r.key !== "mail-" + c.id) throw Error("MAIL_KEY_MISMATCH");
    if (
      !["unknown", "not_sent"].includes(r.state) &&
      (!r.providerId || !r.authoritative)
    )
      throw Error("MAIL_UNVERIFIED_EVIDENCE");
    return tx(() => {
      const q = one(
        "SELECT q.*,o.email_hash,o.created AS outbox_created FROM mail_queue q JOIN outbox o ON o.id=q.outbox_id WHERE outbox_id=?",
        c.id,
      );
      if (!q) return { state: "gone" };
      if (q.generation !== c.generation || !q.lease_until) {
        run(
          "UPDATE mail_queue SET needs_check=1,scheduled=0 WHERE outbox_id=?",
          c.id,
        );
        return { state: "processing" };
      }
      if (q.provider_id && r.providerId && q.provider_id !== r.providerId)
        throw Error("MAIL_PROVIDER_ID_MISMATCH");
      if (r.state === "unknown") {
        return this.fail(c, "MAIL_STATUS_UNKNOWN");
      }
      if (r.state === "not_sent") {
        if (
          !r.authoritative ||
          q.provider_id ||
          Date.now() - (q.first_dispatched ?? q.outbox_created) >=
            this.gateway.idempotencyWindowMs
        ) {
          this.setState(c.id, "review", "MAIL_NOT_SENT_UNPROVEN");
          return { state: "review" };
        }
        run(
          "UPDATE mail_queue SET state='retrying',recovery_hold=0,lease_until=0,scheduled=?,last_error='VERIFIED_NOT_ACCEPTED',updated=? WHERE outbox_id=?",
          Date.now() + 2000,
          Date.now(),
          c.id,
        );
        return { state: "retrying" };
      }
      const ranks: Record<string, number> = {
        accepted: 1,
        delivered: 2,
        bounced: 3,
        complained: 4,
      };
      let state =
        r.state === "bounced" && r.permanent !== true ? "accepted" : r.state;
      if ((ranks[q.state] ?? 0) > (ranks[state] ?? 0)) state = q.state;
      const terminal = state !== "accepted",
        checkAgain = !terminal && Date.now() - q.first_dispatched < 86400000;
      run(
        "UPDATE mail_queue SET state=?,provider_id=COALESCE(provider_id,?),lease_until=0,failures=0,recovery_hold=0,last_error=?,needs_check=MAX(needs_check,?),scheduled=?,updated=? WHERE outbox_id=?",
        state,
        providerId.parse(r.providerId),
        r.state === "bounced" && r.permanent !== true
          ? "SOFT_BOUNCE_PENDING"
          : null,
        checkAgain ? 1 : 0,
        Date.now() + 5 * 60000,
        Date.now(),
        c.id,
      );
      run(
        "UPDATE outbox SET status=? WHERE id=?",
        state === "accepted" ? "provider_accepted" : state,
        c.id,
      );
      if (
        state === "complained" ||
        (state === "bounced" && r.permanent === true)
      )
        run(
          "INSERT INTO mail_suppressions VALUES(?,?,?) ON CONFLICT(email_hash) DO UPDATE SET reason=excluded.reason",
          q.email_hash,
          state,
          Date.now(),
        );
      run(
        "UPDATE mail_notifications SET processed=? WHERE outbox_id=? AND id<=? AND processed IS NULL",
        Date.now(),
        c.id,
        c.notificationId,
      );
      audit("mail-core", "mail_" + state, c.id);
      return { state };
    });
  }
  private async call<T>(
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("MAIL_TIMEOUT"));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([request(controller.signal), deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }
  private async execute(c: Claim) {
    try {
      const q = one(
        "SELECT message_enc,provider_id FROM mail_queue WHERE outbox_id=?",
        c.id,
      );
      if (!q) return { state: "gone" };
      const key = "mail-" + c.id;
      if (c.action === "send") {
        const ack = await this.call((signal) =>
          this.gateway.send(open<MailEnvelope>(q.message_enc), key, signal),
        );
        return this.apply(c, {
          key: ack.key,
          providerId: ack.providerId,
          state: "accepted",
          authoritative: true,
        });
      }
      return this.apply(
        c,
        await this.call((signal) =>
          this.gateway.lookup(key, signal, q.provider_id ?? undefined),
        ),
      );
    } catch {
      return this.fail(c);
    }
  }
  async workOnce() {
    if (this.gateway.idempotencyWindowMs === 0) return { state: "disabled" };
    const q = one(
      "SELECT outbox_id FROM mail_queue WHERE profile_digest=? AND lease_until<=? AND scheduled<=? AND (state IN ('queued','retrying','sending','uncertain') OR needs_check=1) ORDER BY updated LIMIT 1",
      this.digest,
      Date.now(),
      Date.now(),
    );
    if (!q) return { state: "idle" };
    const claim = this.claim(q.outbox_id);
    if (!claim) return { state: "processing" };
    return { outboxId: q.outbox_id, ...(await this.execute(claim)) };
  }
  async verify(id: string) {
    if (this.gateway.idempotencyWindowMs === 0) return { state: "disabled" };
    const c = this.claim(id, true);
    if (!c) return { state: "processing" };
    // Explicit verification always queries; it never dispatches a new message.
    c.action = "lookup";
    return this.execute(c);
  }
  notify(body: unknown) {
    limit("mail-notifications", 100, 60000);
    const n = z
      .object({ providerId, eventId: z.string().min(1).max(200) })
      .parse(body);
    return tx(() => {
      const q = one(
        "SELECT outbox_id FROM mail_queue WHERE profile_digest=? AND provider_id=?",
        this.digest,
        n.providerId,
      );
      if (!q) return { queued: false };
      const inserted = run(
        "INSERT OR IGNORE INTO mail_notifications(event_key,outbox_id,received) VALUES(?,?,?)",
        hash(this.digest + ":" + n.providerId + ":" + n.eventId),
        q.outbox_id,
        Date.now(),
      );
      if (inserted.changes)
        run(
          "UPDATE mail_queue SET needs_check=1,scheduled=0 WHERE outbox_id=?",
          q.outbox_id,
        );
      return { queued: !!inserted.changes };
    });
  }
}
