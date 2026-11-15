import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { Fault } from "@/lib/security";
import { MailDeliveryCoordinator } from "@/lib/mail-delivery";
import { receiveResendWebhook } from "@/lib/integrations/resend-webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function POST(request: Request) {
  if (process.env.RESEND_WEBHOOK_MODE !== "receipt-only")
    return NextResponse.json(
      { error: "MAIL_WEBHOOK_DISABLED" },
      { status: 503, headers },
    );
  try {
    const cfg = config(),
      scope = process.env.RESEND_ACCOUNT_SCOPE ?? "";
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(scope))
      throw new Fault("MAIL_WEBHOOK_CONFIG_REQUIRED", 503);
    const blocked = async () => {
      throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
    };
    const coordinator = new MailDeliveryCoordinator(
      {
        sender: process.env.TRANSACTION_MAIL_SENDER ?? "",
        replyTo: process.env.TRANSACTION_MAIL_REPLY_TO ?? "",
        origin: cfg.origin,
      },
      {
        name: "resend-" + scope,
        idempotencyWindowMs: 86400000,
        send: blocked,
        lookup: blocked,
      },
    );
    const result = await receiveResendWebhook(request, {
      secret: process.env.RESEND_WEBHOOK_SECRET ?? "",
      coordinator,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Fault ? error.code : "MAIL_WEBHOOK_UNAVAILABLE",
      },
      { status: error instanceof Fault ? error.status : 503, headers },
    );
  }
}
