/** Candidate Resend adapter. Not registered in app/worker; no environment flag activates it. */
import { z } from "zod";
import type { MailGateway, MailEvidence } from "./mail-gateway";
const keySchema = z.string().regex(/^mail-[a-f0-9-]{36}$/);
const idSchema = z.string().uuid();
const email = z
  .string()
  .email()
  .max(254)
  .refine((v) => !/[\r\n]/.test(v));
const envelope = z
  .object({
    from: email,
    to: email,
    replyTo: email,
    subject: z
      .string()
      .min(1)
      .max(200)
      .refine((v) => !/[\r\n]/.test(v)),
    text: z.string().min(1).max(16000),
    html: z.string().min(1).max(32000),
  })
  .strict();
export function createResendMailGateway(options: {
  apiKey: string;
  accountScope: string;
  enabled?: boolean;
  fetch?: typeof fetch;
}): MailGateway {
  if (!/^re_[A-Za-z0-9_-]{8,256}$/.test(options.apiKey))
    throw Error("RESEND_CREDENTIAL_FORMAT_REQUIRED");
  const scope = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,48}$/)
    .parse(options.accountScope);
  const send = options.fetch ?? globalThis.fetch;
  async function request(
    method: "POST" | "GET",
    path: string,
    body: unknown,
    key: string,
    signal?: AbortSignal,
  ) {
    if (options.enabled !== true)
      throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
    const abort = AbortSignal.any([
      AbortSignal.timeout(10000),
      ...(signal ? [signal] : []),
    ]);
    try {
      const response = await send("https://api.resend.com" + path, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: abort,
        headers: {
          Authorization: "Bearer " + options.apiKey,
          ...(method === "POST"
            ? { "Content-Type": "application/json", "Idempotency-Key": key }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw Error("RESEND_HTTP_" + response.status);
      if (!response.body) throw Error("RESEND_INVALID_RESPONSE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 128 * 1024) {
            await reader.cancel();
            throw Error("RESEND_RESPONSE_TOO_LARGE");
          }
          chunks.push(item.value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw Error("RESEND_INVALID_RESPONSE");
      }
    } catch (error) {
      if (abort.aborted) throw Error("RESEND_TIMEOUT_RECONCILIATION_REQUIRED");
      if (
        error instanceof Error &&
        /^RESEND_(HTTP_\d{3}|INVALID_RESPONSE|RESPONSE_TOO_LARGE)$/.test(
          error.message,
        )
      )
        throw error;
      throw Error("RESEND_NETWORK_RECONCILIATION_REQUIRED");
    }
  }
  return {
    name: "resend-" + scope,
    idempotencyWindowMs: 24 * 3600000,
    async send(message, key, signal) {
      keySchema.parse(key);
      const m = envelope.parse(message);
      const raw = await request(
        "POST",
        "/emails",
        {
          from: m.from,
          to: [m.to],
          reply_to: m.replyTo,
          subject: m.subject,
          text: m.text,
          html: m.html,
          tags: [{ name: "gumseo_key", value: key }],
        },
        key,
        signal,
      );
      const parsed = z.object({ id: idSchema }).safeParse(raw);
      if (!parsed.success) throw Error("RESEND_INVALID_RESPONSE");
      return { key, providerId: parsed.data.id };
    },
    async lookup(key, signal, providerId): Promise<MailEvidence> {
      keySchema.parse(key);
      // Resend has no lookup-by-idempotency-key contract. Never infer non-acceptance or resend.
      if (!providerId) return { key, state: "unknown" };
      if (!idSchema.safeParse(providerId).success)
        throw Error("RESEND_PROVIDER_ID_REQUIRED");
      const raw = await request(
        "GET",
        "/emails/" + providerId,
        undefined,
        key,
        signal,
      );
      const parsed = z
        .object({
          id: idSchema,
          last_event: z.string(),
          tags: z.array(z.object({ name: z.string(), value: z.string() })),
        })
        .safeParse(raw);
      if (!parsed.success) throw Error("RESEND_INVALID_RESPONSE");
      const r = parsed.data,
        tags = r.tags.filter((t) => t.name === "gumseo_key");
      if (r.id !== providerId || tags.length !== 1 || tags[0].value !== key)
        throw Error("RESEND_EVIDENCE_MISMATCH");
      if (r.last_event === "delivered")
        return { key, providerId, state: "delivered", authoritative: true };
      if (r.last_event === "complained")
        return {
          key,
          providerId,
          state: "complained",
          permanent: true,
          authoritative: true,
        };
      if (
        [
          "sent",
          "queued",
          "scheduled",
          "delivery_delayed",
          "opened",
          "clicked",
        ].includes(r.last_event)
      )
        return { key, providerId, state: "accepted", authoritative: true };
      // A bare bounced/failed event does not establish a permanent-recipient failure reason.
      return { key, providerId, state: "unknown" };
    },
  };
}
