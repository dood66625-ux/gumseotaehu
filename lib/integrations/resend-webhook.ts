/** Signed receipt only: no state changes based on event claims and no provider requests. */
import { Webhook } from "svix";
import { z } from "zod";
import { Fault } from "../security";
import type { MailDeliveryCoordinator } from "../mail-delivery";
const supported = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);
async function rawBody(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new Fault("MAIL_WEBHOOK_JSON_REQUIRED", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536))
    throw new Fault("MAIL_WEBHOOK_TOO_LARGE", 413);
  if (!request.body) throw new Fault("MAIL_WEBHOOK_BODY_REQUIRED", 400);
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          total += item.value.byteLength;
          if (total > 65536) throw new Fault("MAIL_WEBHOOK_TOO_LARGE", 413);
          chunks.push(item.value);
        }
        return Buffer.concat(chunks);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Fault("MAIL_WEBHOOK_TIMEOUT", 408)),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* outstanding read is canceled */
    }
  }
}
export async function receiveResendWebhook(
  request: Request,
  options: {
    secret: string;
    coordinator: Pick<MailDeliveryCoordinator, "notify">;
  },
) {
  const encoded = options.secret.startsWith("whsec_")
    ? options.secret.slice(6)
    : "";
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== encoded)
    throw new Fault("MAIL_WEBHOOK_CONFIG_REQUIRED", 503);
  const id = request.headers.get("svix-id") ?? "",
    timestamp = request.headers.get("svix-timestamp") ?? "",
    signature = request.headers.get("svix-signature") ?? "";
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    !/^\d{10,12}$/.test(timestamp) ||
    signature.length > 4096 ||
    !signature
  )
    throw new Fault("MAIL_WEBHOOK_AUTHENTICATION_FAILED", 401);
  const raw = await rawBody(request);
  let event: unknown;
  try {
    new Webhook(options.secret).verify(raw, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
  } catch {
    throw new Fault("MAIL_WEBHOOK_AUTHENTICATION_FAILED", 401);
  }
  // Svix v2 verifies bytes only; parse the authenticated body explicitly afterwards.
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new Fault("MAIL_WEBHOOK_INVALID_EVENT", 400);
  }
  const type = z.object({ type: z.string().max(100) }).safeParse(event);
  if (!type.success) throw new Fault("MAIL_WEBHOOK_INVALID_EVENT", 400);
  if (!supported.has(type.data.type)) return { accepted: true, queued: false };
  const parsed = z
    .object({ data: z.object({ email_id: z.string().uuid() }) })
    .safeParse(event);
  if (!parsed.success) throw new Fault("MAIL_WEBHOOK_INVALID_EVENT", 400);
  // A verified signature permits a lookup signal only. The independent GET decides delivery/suppression.
  return {
    accepted: true,
    ...options.coordinator.notify({
      providerId: parsed.data.data.email_id,
      eventId: id,
    }),
  };
}
