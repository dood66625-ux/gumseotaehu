import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  if (
    process.env.TOSS_PAYMENT_MODE !== "live" ||
    process.env.LIVE_PAYMENTS_APPROVAL !== "live-payments-approved"
  )
    return [];
  return [
    "",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refund",
    "/legal/business",
    "/legal/content",
  ].map((path) => ({
    url: "https://gumseo.kr" + (path || "/"),
    changeFrequency: "monthly",
    priority: path ? 0.3 : 1,
  }));
}
