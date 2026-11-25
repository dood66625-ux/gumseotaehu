import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { limit } from "@/lib/security";
import { readJsonObject } from "@/lib/http-body";
import { recordVisit, visitorCookie, visitKey } from "@/lib/visitor-log";
import { visitStages } from "@/lib/visit-stages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (
    ![config().origin, "https://gumseo.kr"].includes(
      req.headers.get("origin") ?? "",
    )
  )
    return NextResponse.json(
      { error: "ORIGIN_REQUIRED" },
      { status: 403, headers },
    );
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json(
      { error: "JSON_REQUIRED" },
      { status: 415, headers },
    );
  try {
    limit("usage-global", 3000, 60000);
    const body = z
      .object({
        stage: z.enum(
          Object.keys(visitStages) as [
            keyof typeof visitStages,
            ...(keyof typeof visitStages)[],
          ],
        ),
        referrer: z.string().max(2048).optional(),
      })
      .strict()
      .parse(await readJsonObject(req, 4096));
    const old = req.cookies.get(visitorCookie)?.value;
    const key = visitKey(old);
    if (key) limit("usage:" + key, 120, 3600000);
    const visit = recordVisit(db(), old, body.stage, body.referrer);
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(visitorCookie, visit.token, {
      httpOnly: true,
      secure: req.headers.get("origin")?.startsWith("https:") ?? false,
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "USAGE_NOT_ACCEPTED" },
      { status: 400, headers },
    );
  }
}
