/** Standalone private reader; explicit --serve-live flag, separate encrypted storage and budget. */
import { createServer } from "node:http";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  lstatSync,
} from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrivateReader } from "../lib/private-reader";
import { generateAiReport } from "../lib/integrations/ai-contract";
import {
  approvedOpenAiModel,
  aiPricing,
  createOrderOpenAiTransport,
} from "../lib/integrations/openai-http";
if (process.argv.slice(2).join(" ") !== "--serve-live")
  throw Error("PRIVATE_LIVE_FLAG_REQUIRED");
if (existsSync(".env.local") && !process.env.OPENAI_API_KEY)
  process.loadEnvFile(".env.local");
if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(process.env.OPENAI_API_KEY ?? ""))
  throw Error("PRIVATE_API_KEY_REQUIRED");
const root = resolve("var/private-reader");
mkdirSync(root, { recursive: true, mode: 0o700 });
if (lstatSync(root).isSymbolicLink()) throw Error("PRIVATE_STORAGE_REQUIRED");
const configPath = root + "/access.json";
if (!existsSync(configPath))
  writeFileSync(
    configPath,
    JSON.stringify({
      invite: randomBytes(32).toString("base64url"),
      secret: randomBytes(32).toString("hex"),
      key: randomBytes(32).toString("hex"),
    }),
    { mode: 0o600, flag: "wx" },
  );
for (const file of [configPath, root + "/reader.sqlite"]) {
  if (existsSync(file) && lstatSync(file).isSymbolicLink())
    throw Error("PRIVATE_STORAGE_REQUIRED");
}
const access = JSON.parse(readFileSync(configPath, "utf8"));
const db = new DatabaseSync(root + "/reader.sqlite");
chmodSync(root + "/reader.sqlite", 0o600);
db.exec("PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000");
const maxCalls = Number(process.env.PRIVATE_READER_MAX_CALLS ?? 10);
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 10)
  throw Error("PRIVATE_CALL_LIMIT_INVALID");
const origin = process.env.PRIVATE_READER_ORIGIN || "http://127.0.0.1:3450";
const assets: Record<string, { type: string; bytes: Buffer }> = {};
for (const [file, type] of [
  ["reader.js", "text/javascript; charset=utf-8"],
  ["style.css", "text/css; charset=utf-8"],
  ["korean-reading-regular.woff2", "font/woff2"],
  ["korean-reading-bold.woff2", "font/woff2"],
  ["geumseo-logo-v1.webp", "image/webp"],
])
  assets["/private-reading/" + file] = {
    type,
    bytes: readFileSync("public/private-reader/" + file),
  };
for (let i = 1; i <= 9; i++) {
  const file = `chapter-${String(i).padStart(2, "0")}.jpg`;
  assets["/private-reading/" + file] = {
    type: "image/jpeg",
    bytes: readFileSync("public/report-art/" + file),
  };
}
const app = createPrivateReader({
  db,
  policy: {
    dailyUsdMicros: maxCalls * 60000,
    lifetimeUsdMicros: maxCalls * 60000,
    reservationUsdMicros: 60000,
  },
  origin,
  secret: Buffer.from(access.secret, "hex"),
  key: Buffer.from(access.key, "hex"),
  inviteDigest: createHash("sha256").update(access.invite).digest("hex"),
  html: readFileSync("public/private-reader/index.html", "utf8").replace(
    'data-call-limit="10"',
    'data-call-limit="' + maxCalls + '"',
  ),
  assets,
  async generate(chart, locale, recordUsage) {
    const transport = createOrderOpenAiTransport({
      approval: "customer-data-approved",
      chart,
      locale,
      apiKey: process.env.OPENAI_API_KEY!,
      reserve() {},
      onUsage(usage) {
        recordUsage(usage.estimatedUsdMicros);
      },
    });
    const report = await generateAiReport(
      chart,
      approvedOpenAiModel,
      transport,
      locale,
    );
    report.generation = {
      model: approvedOpenAiModel,
      pricingVersion: aiPricing.version,
    };
    return report;
  },
});
const server = createServer(async (req, res) => {
  try {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) {
        res.writeHead(413);
        res.end();
        return;
      }
      parts.push(chunk);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === "string") headers.set(k, v);
    const response = await app(
      new Request(origin + (req.url ?? "/"), {
        method: req.method,
        headers,
        body: req.method === "POST" ? Buffer.concat(parts) : undefined,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503, { "Cache-Control": "no-store" });
    res.end("PRIVATE_READER_UNAVAILABLE");
  }
});
const cleanup = setInterval(
  () =>
    db
      .prepare("DELETE FROM private_readings WHERE created<?")
      .run(Date.now() - 86400000),
  60000,
);
server.requestTimeout = 60000;
server.headersTimeout = 10000;
server.listen(3450, "127.0.0.1", () =>
  console.log(
    "Private reader ready on loopback 3450; access URL stored privately; no model call at startup.",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      clearInterval(cleanup);
      db.close();
      process.exit(0);
    }),
  );
