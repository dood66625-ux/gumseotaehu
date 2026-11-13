import { readFileSync } from "node:fs";
/** Build-time static HTML route; independent of DB, auth, AI and React hydration. */
export const dynamic = "force-static";
export const runtime = "nodejs";
export function GET() {
  return new Response(readFileSync("public/landing.html", "utf8"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
