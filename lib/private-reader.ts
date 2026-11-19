import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { calculateLocal, localBirthSchema } from "./astrology-core";
import { encryptJson, decryptJson } from "./crypto";
import type { AiSpendPolicy } from "./ai-spend-ledger";
import { aiSpendLedger } from "./ai-spend-ledger";
import type { Report } from "./interpretation";
import { validateReport } from "./interpretation";
import { z } from "zod";
export const privateReaderPolicy = {
  dailyUsdMicros: 600000,
  lifetimeUsdMicros: 600000,
  reservationUsdMicros: 60000,
};
const inputSchema = z
  .object({
    locale: z.enum(["ko", "zh-TW"]),
    consent: z.literal(true),
    birth: localBirthSchema,
  })
  .strict();
export function createPrivateReader(options: {
  db: DatabaseSync;
  policy?: AiSpendPolicy;
  inviteDigest: string;
  secret: Buffer;
  key: Buffer;
  origin: string;
  html: string;
  assets: Record<string, { type: string; bytes: Buffer }>;
  generate: (
    chart: ReturnType<typeof calculateLocal>,
    locale: "ko" | "zh-TW",
    recordUsage: (amount: number) => void,
  ) => Promise<Report>;
}) {
  const { db } = options,
    ledger = aiSpendLedger(db, options.policy ?? privateReaderPolicy);
  if (
    options.secret.length !== 32 ||
    options.key.length !== 32 ||
    !/^https?:\/\//.test(options.origin)
  )
    throw Error("PRIVATE_READER_CONFIGURATION_REQUIRED");
  db.exec(
    "CREATE TABLE IF NOT EXISTS private_readings(id TEXT PRIMARY KEY,session_hash TEXT NOT NULL,digest TEXT NOT NULL,locale TEXT NOT NULL,state TEXT NOT NULL,payload TEXT,created INTEGER NOT NULL,UNIQUE(session_hash,digest,locale))",
  );
  db.exec(
    "BEGIN IMMEDIATE; UPDATE ai_spend_calls SET state='uncertain' WHERE state='reserved' AND id IN (SELECT id FROM private_readings WHERE state='running'); UPDATE private_readings SET state='held',payload=NULL WHERE state='running'; COMMIT;",
  );
  const mac = (s: string) =>
    createHmac("sha256", options.secret)
      .update("private-reader-v1:" + s)
      .digest("hex");
  const equal = (a: string, b: string) =>
    timingSafeEqual(
      createHash("sha256").update(a).digest(),
      createHash("sha256").update(b).digest(),
    );
  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers });
  const session = (request: Request) => {
    const value =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("gs_private="))
        ?.slice(11) ?? "";
    const parts = value.split(".");
    if (
      parts.length !== 3 ||
      !/^\d+$/.test(parts[1]) ||
      Number(parts[1]) < Date.now() ||
      Number(parts[1]) > Date.now() + 25 * 3600000 ||
      !equal(mac(parts[0] + "." + parts[1]), parts[2])
    )
      return null;
    return mac(parts[0]);
  };
  const result = (row: Record<string, any>) =>
    row.state === "ready"
      ? json({
          id: row.id,
          state: "ready",
          locale: row.locale,
          report: decryptJson(row.payload, options.key),
        })
      : row.state === "running"
        ? json({ id: row.id, state: "running" }, 202)
        : json(
            {
              id: row.id,
              state: "held",
              code: "RESULT_HELD_NO_AUTOMATIC_RETRY",
            },
            409,
          );
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.origin !== options.origin)
        return json({ code: "ORIGIN_REJECTED" }, 403);
      if (
        url.pathname.startsWith("/private-reading/invite/") &&
        request.method === "GET"
      ) {
        const token = url.pathname.slice("/private-reading/invite/".length);
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(token) ||
          !equal(
            createHash("sha256").update(token).digest("hex"),
            options.inviteDigest,
          )
        )
          return json({ code: "NOT_FOUND" }, 404);
        if (session(request))
          return new Response(null, {
            status: 303,
            headers: { ...headers, Location: "/private-reading" },
          });
        const value =
          randomBytes(24).toString("base64url") +
          "." +
          (Date.now() + 24 * 3600000);
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: "/private-reading",
            "Set-Cookie": `gs_private=${value}.${mac(value)}; HttpOnly; SameSite=Lax; Path=/private-reading; Max-Age=86400${options.origin.startsWith("https:") ? "; Secure" : ""}`,
          },
        });
      }
      const owner = session(request);
      if (!owner) return json({ code: "PRIVATE_LINK_REQUIRED" }, 403);
      if (request.method === "GET" && url.pathname === "/private-reading")
        return new Response(options.html, {
          headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        });
      if (request.method === "GET" && options.assets[url.pathname]) {
        const a = options.assets[url.pathname];
        return new Response(new Uint8Array(a.bytes), {
          headers: { ...headers, "Content-Type": a.type },
        });
      }
      db.prepare("DELETE FROM private_readings WHERE created<?").run(
        Date.now() - 86400000,
      );
      if (
        request.method === "GET" &&
        url.pathname === "/private-reading/latest"
      ) {
        const row = db
          .prepare(
            "SELECT * FROM private_readings WHERE session_hash=? ORDER BY created DESC LIMIT 1",
          )
          .get(owner);
        return row ? result(row) : json({ code: "NOT_FOUND" }, 404);
      }
      if (
        request.method === "GET" &&
        /^\/private-reading\/result\/[a-f0-9-]{36}$/.test(url.pathname)
      ) {
        const row = db
          .prepare(
            "SELECT * FROM private_readings WHERE id=? AND session_hash=?",
          )
          .get(url.pathname.split("/").pop()!, owner);
        return row ? result(row) : json({ code: "NOT_FOUND" }, 404);
      }
      if (
        request.method !== "POST" ||
        url.pathname !== "/private-reading/generate"
      )
        return json({ code: "NOT_FOUND" }, 404);
      if (
        request.headers.get("origin") !== options.origin ||
        !request.headers.get("content-type")?.startsWith("application/json")
      )
        return json({ code: "ORIGIN_REJECTED" }, 403);
      const text = await request.text();
      if (Buffer.byteLength(text) > 2048)
        return json({ code: "INPUT_TOO_LARGE" }, 413);
      const parsed = inputSchema.safeParse(JSON.parse(text));
      if (!parsed.success)
        return json({ code: "INVALID_BIRTH_OR_CONSENT" }, 400);
      const { birth, locale } = parsed.data;
      if (birth.calendar !== "solar")
        return json({ code: "SOLAR_CALENDAR_REQUIRED" }, 400);
      const chart = calculateLocal({ ...birth, name: "guest" });
      const [y, m, d] = chart.solarDate.split("-").map(Number),
        today = new Date(Date.now() + (birth.place === "TW" ? 8 : 9) * 3600000);
      const age =
        today.getUTCFullYear() -
        y -
        ((today.getUTCMonth() + 1) * 100 + today.getUTCDate() < m * 100 + d
          ? 1
          : 0);
      if (age < 19) return json({ code: "ADULT_REQUIRED" }, 400);
      const digest = mac(JSON.stringify({ chart, locale }));
      const prior = db
        .prepare(
          "SELECT * FROM private_readings WHERE session_hash=? AND digest=? AND locale=?",
        )
        .get(owner, digest, locale);
      if (prior) return result(prior);
      const id = ledger.reserve(
        randomBytes(16)
          .toString("hex")
          .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
        1,
      );
      db.prepare(
        "INSERT INTO private_readings VALUES(?,?,?,?,'running',NULL,?)",
      ).run(id, owner, digest, locale, Date.now());
      try {
        let cost: number | null = null;
        const report = validateReport(
          await options.generate(chart, locale, (amount) => {
            ledger.recordUsage(id, amount);
            cost = Math.max(cost ?? 0, amount);
          }),
          chart,
        );
        if (cost === null || report.provider !== "openai")
          throw Error("PRIVATE_USAGE_REQUIRED");
        report.usage.estimatedUsdMicros = cost;
        const storedReport = structuredClone(report);
        delete (storedReport.chart as Partial<typeof chart>).solarDate;
        db.prepare(
          "UPDATE private_readings SET state='ready',payload=? WHERE id=?",
        ).run(encryptJson(storedReport, options.key), id);
        ledger.finish(id, "completed");
        return result(
          db.prepare("SELECT * FROM private_readings WHERE id=?").get(id)!,
        );
      } catch {
        ledger.finish(id, "uncertain");
        db.prepare("UPDATE private_readings SET state='held' WHERE id=?").run(
          id,
        );
        return json(
          { id, state: "held", code: "RESULT_HELD_NO_AUTOMATIC_RETRY" },
          409,
        );
      }
    } catch (error) {
      const code =
        error instanceof Error &&
        /^(AI_SPEND_LIMIT_REACHED|SUPPORTED_YEAR_RANGE)$/.test(error.message)
          ? error.message
          : "CALCULATION_OR_REQUEST_FAILED";
      return json({ code }, code === "AI_SPEND_LIMIT_REACHED" ? 429 : 400);
    }
  };
}
