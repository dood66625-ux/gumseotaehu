import { readFileSync } from "node:fs";
/** Build-time static HTML route; independent of DB, auth, AI and React hydration. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(req?: Request) {
  const screen = req ? new URL(req.url).searchParams.get("screen") : null;
  const legacy: Record<string, string> = {
    privacy: "/legal/privacy",
    terms: "/legal/terms",
    business: "/legal/business",
    refund: "/legal/refund",
    content: "/legal/content",
    start: "/start",
    admin: "/admin",
    recover: "/recover",
    help: "/help",
  };
  if (screen && legacy[screen])
    return new Response(null, {
      status: 302,
      headers: { Location: legacy[screen], "Cache-Control": "no-store" },
    });
  const live =
    process.env.TOSS_PAYMENT_MODE === "live" &&
    process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved";
  return new Response(
    readFileSync(
      live ? "public/landing-live.html" : "public/landing.html",
      "utf8",
    ),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": live
          ? "private, no-store"
          : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
