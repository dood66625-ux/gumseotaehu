/** Signed notification adapter. Receipt only queues lookup; it never approves/cancels payment. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { one } from "../db";
import { Fault } from "../security";
import { readRawBody } from "../raw-body";
import type { TossOrderCoordinator } from "./toss-orders";
export function verifyTossWebhookSignature(
  raw: Uint8Array,
  headers: Headers,
  securityKey: Buffer,
  now = Date.now(),
) {
  if (securityKey.length !== 32) throw Error("INVALID_TOSS_WEBHOOK_KEY");
  const time = headers.get("tosspayments-webhook-transmission-time");
  const signatures = headers.get("tosspayments-webhook-signature");
  if (
    !time ||
    time.length > 128 ||
    /[\x00-\x1f\x7f]/.test(time) ||
    !signatures ||
    signatures.length > 8192
  )
    throw new Fault("INVALID_TOSS_WEBHOOK_SIGNATURE", 401);
  // Use the original body bytes, ':' and the exact signed header value. Never parse/re-serialize first.
  const expected = createHmac("sha256", securityKey)
    .update(raw)
    .update(":")
    .update(time)
    .digest();
  let valid = false;
  for (const part of signatures.split(",")) {
    const signature = part.trim();
    if (!signature.startsWith("v1:")) continue;
    const value = signature.slice(3);
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) continue;
    const bytes = Buffer.from(value, "base64");
    if (
      bytes.length === expected.length &&
      bytes.toString("base64") === value &&
      timingSafeEqual(bytes, expected)
    )
      valid = true;
  }
  if (!valid) throw new Fault("INVALID_TOSS_WEBHOOK_SIGNATURE", 401);
  // Freshness uses the delivery timestamp, not the possibly days-old event createdAt.
  // Five minutes is this application's policy; clocks must be synchronized in staging/production.
  const sent = Date.parse(time);
  if (
    !z.iso.datetime({ offset: true }).safeParse(time).success ||
    !Number.isFinite(sent) ||
    sent < now - 5 * 60000 ||
    sent > now + 30000
  )
    throw new Fault("STALE_TOSS_WEBHOOK", 401);
}
const opaque = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => !/[\x00-\x1f\x7f]/.test(s));
const notification = z.object({
  eventType: z.literal("PAYMENT_STATUS_CHANGED"),
  eventId: opaque.optional(),
  createdAt: z.string().min(1).max(100),
  data: z.object({
    orderId: z.string().uuid(),
    paymentKey: opaque,
    mId: z.string().min(1).max(100),
    status: z.string().min(1).max(100),
    lastTransactionKey: opaque.nullish(),
  }),
});
export async function receiveTossWebhook(
  request: Request,
  options: {
    securityKey: Buffer;
    merchantId: string;
    coordinator: Pick<TossOrderCoordinator, "notify">;
  },
) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new Fault("WEBHOOK_JSON_REQUIRED", 415);
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity")
    throw new Fault("WEBHOOK_ENCODING_NOT_SUPPORTED", 415);
  const raw = await readRawBody(request);
  verifyTossWebhookSignature(raw, request.headers, options.securityKey);
  let body: unknown;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw),
    );
  } catch {
    throw new Fault("INVALID_TOSS_WEBHOOK_JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Fault("INVALID_TOSS_WEBHOOK_JSON");
  // Unknown signed event types are acknowledged, without processing unrelated products.
  if ((body as Record<string, unknown>).eventType !== "PAYMENT_STATUS_CHANGED")
    return { accepted: true, queued: false };
  const parsed = notification.safeParse(body);
  if (!parsed.success) throw new Fault("INVALID_TOSS_WEBHOOK_EVENT");
  const n = parsed.data;
  if (n.data.mId !== options.merchantId)
    throw new Fault("TOSS_WEBHOOK_MERCHANT_MISMATCH", 409);
  const bound = one(
    "SELECT order_id FROM toss_attempts WHERE order_id=? AND payment_key=? AND merchant_id=?",
    n.data.orderId,
    n.data.paymentKey,
    options.merchantId,
  );
  if (!bound) return { accepted: true, queued: false };
  // Transmission IDs/times change on retry. Prefer the opaque eventId, otherwise canonical stable event facts.
  const identity = n.eventId
    ? JSON.stringify({ eventId: n.eventId })
    : JSON.stringify({
        eventType: n.eventType,
        createdAt: n.createdAt,
        orderId: n.data.orderId,
        paymentKey: n.data.paymentKey,
        merchantId: n.data.mId,
        status: n.data.status,
        lastTransactionKey: n.data.lastTransactionKey ?? null,
      });
  const eventId =
    "signed-" + createHash("sha256").update(identity).digest("hex");
  return {
    accepted: true,
    ...options.coordinator.notify({ orderId: n.data.orderId, eventId }),
  };
}
