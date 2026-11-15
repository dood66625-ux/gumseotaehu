import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { Fault } from "@/lib/security";
import { receiveTossWebhook } from "@/lib/integrations/toss-webhook";
import { TossOrderCoordinator } from "@/lib/integrations/toss-orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function POST(request: Request) {
  try {
    config();
    if (process.env.TOSS_TEST_WEBHOOK_MODE !== "signed-test-only")
      return NextResponse.json(
        { error: "TOSS_TEST_WEBHOOK_DISABLED" },
        { status: 503, headers },
      );
    const key = process.env.TOSS_TEST_WEBHOOK_SECURITY_KEY ?? "",
      merchantId = process.env.TOSS_TEST_MERCHANT_ID ?? "";
    if (
      !/^[a-fA-F0-9]{64}$/.test(key) ||
      !/^test_sk_[A-Za-z0-9_]+$/.test(process.env.TOSS_TEST_SECRET_KEY ?? "") ||
      !merchantId ||
      merchantId.length > 100
    )
      return NextResponse.json(
        { error: "TOSS_TEST_WEBHOOK_CONFIG_REQUIRED" },
        { status: 503, headers },
      );
    // Receipt never calls the provider. Only a separately enabled test recovery worker may query it later.
    const blocked = async () => {
      throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
    };
    const coordinator = new TossOrderCoordinator(
      { confirm: blocked, lookup: blocked, cancel: blocked },
      merchantId,
    );
    const result = await receiveTossWebhook(request, {
      securityKey: Buffer.from(key, "hex"),
      merchantId,
      coordinator,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof Fault)
      return NextResponse.json(
        { error: error.code },
        { status: error.status, headers },
      );
    return NextResponse.json(
      { error: "TOSS_WEBHOOK_UNAVAILABLE" },
      { status: 500, headers },
    );
  }
}
