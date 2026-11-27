import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const live =
    process.env.TOSS_PAYMENT_MODE === "live" &&
    process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved";
  return live
    ? {
        rules: {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/api/",
            "/admin",
            "/report/",
            "/checkout",
            "/recover",
            "/reading/",
            "/start",
            "/_internal/",
          ],
        },
        sitemap: "https://gumseo.kr/sitemap.xml",
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
