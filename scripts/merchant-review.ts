/** Isolated public TEST checkout facade. Synthetic births/emails only; no AI or mail. */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createHmac } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  lstatSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { config } from "../lib/config";
import { one, closeDb } from "../lib/db";
import * as svc from "../lib/service";
import { hash, limit } from "../lib/security";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import { tossTestKeyPair } from "../lib/integrations/toss-key-profile.mjs";
import { TossTestContract } from "../lib/integrations/toss";
import { TossOrderCoordinator } from "../lib/integrations/toss-orders";
import { createTossTestTransport } from "../lib/integrations/toss-http";
import { createTossSandboxHandler } from "../lib/integrations/toss-sandbox-web";
import { reportPdf } from "../lib/pdf";
import { business } from "../lib/business";

async function main() {
  if (process.argv.slice(2).join(" ") !== "--test-network")
    throw Error("TEST_NETWORK_FLAG_REQUIRED");
  if (
    tossTestKeyPair(
      process.env.TOSS_TEST_CLIENT_KEY,
      process.env.TOSS_TEST_SECRET_KEY,
    ) !== "widget"
  )
    throw Error("TEST_WIDGET_KEYS_REQUIRED");
  const origin = process.env.MERCHANT_REVIEW_ORIGIN || "https://pay.gumseo.kr";
  if (!["https://pay.gumseo.kr", "http://127.0.0.1:3212"].includes(origin))
    throw Error("REVIEW_ORIGIN_NOT_ALLOWED");
  const internal = "http://127.0.0.1:3212";
  mkdirSync("var/merchant-review", { recursive: true, mode: 0o700 });
  for (const path of ["var", "var/merchant-review"]) {
    if (
      !lstatSync(path).isDirectory() ||
      lstatSync(path).isSymbolicLink() ||
      realpathSync(path) !== resolve(path)
    )
      throw Error("ISOLATED_REVIEW_DIRECTORY_REQUIRED");
  }
  process.env.DATABASE_PATH = resolve("var/merchant-review/journey.sqlite");
  if (
    existsSync(process.env.DATABASE_PATH) &&
    (!lstatSync(process.env.DATABASE_PATH).isFile() ||
      lstatSync(process.env.DATABASE_PATH).isSymbolicLink())
  )
    throw Error("ISOLATED_REVIEW_DATABASE_REQUIRED");
  const cfg = config();
  const mid = process.env.TOSS_TEST_MID;
  if (mid !== "tq_gdood65qf7") throw Error("VERIFIED_TEST_MID_REQUIRED");
  const coordinator = new TossOrderCoordinator(
    new TossTestContract(
      process.env.TOSS_TEST_SECRET_KEY!,
      createTossTestTransport({ enabled: true }),
    ),
    mid,
  );
  const clientScript = readFileSync("scripts/toss-sandbox-client.mjs", "utf8");
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const footer = `<p><a href="https://gumseo.kr/refund.html">환불 및 취소 규정</a> · <a href="https://gumseo.kr/">금서태후 홈페이지</a></p><footer>${escape(business.name)} · 사업자등록번호 ${escape(business.registrationNumber)}<br>사업장 주소: ${escape(business.address)}<br>문의: ${escape(business.email)}</footer>`;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await coordinator.recoverPending();
      svc.workOnce();
      svc.reconcileRefunds();
    } catch {
      console.error("REVIEW_RECOVERY_CHECK_REQUIRED");
    } finally {
      busy = false;
    }
  }, 2000);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url || "/", internal).pathname;
      if (path === "/health" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end('{"mode":"isolated-toss-test"}');
        return;
      }
      if (
        req.headers.host !== new URL(origin).host ||
        ["/admin", "/login", "/refund"].includes(path)
      ) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      if (req.method !== "GET" && req.headers.origin !== origin) {
        res.writeHead(403);
        res.end("Origin rejected");
        return;
      }
      const cookies = (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim());
      let token = cookies.find((v) => v.startsWith("gs_review="))?.slice(10);
      let s = token ? svc.sessionFor(token) : null;
      let fresh = false;
      if (!s && path === "/" && req.method === "GET") {
        limit("review-new-session", 40, 3600000);
        const created = svc.newSession();
        token = created.token;
        const email = "review-" + created.session.id + "@example.invalid";
        const challenge = svc.requestOtp(created.session, email);
        svc.verifyOtp(
          created.session,
          challenge,
          svc.localOtp(created.session, challenge).code,
        );
        s = one<svc.Session>(
          "SELECT * FROM sessions WHERE id=?",
          created.session.id,
        )!;
        fresh = true;
      }
      if (
        !s ||
        !token ||
        s.email_hash !== hash("review-" + s.id + "@example.invalid")
      ) {
        res.writeHead(401, { "Cache-Control": "no-store" });
        res.end("Start at the test checkout homepage");
        return;
      }
      let order = svc.listOrders(s)[0];
      if (!order) {
        const reading = svc.makeReading(s, syntheticBirths.known);
        const id = svc.createOrder(s, reading, {
          terms: true,
          privacy: true,
          withdrawal: true,
          confirmedBirth: true,
          buyerAdult: true,
        });
        order = svc.orderView(svc.ownOrder(s, id));
      }
      const customer = s,
        orderId = order.id;
      const handler = createTossSandboxHandler({
        origin: internal,
        clientKey: process.env.TOSS_TEST_CLIENT_KEY!,
        merchantConfigured: true,
        clientScript,
        sessionGate: createHmac("sha256", cfg.secret)
          .update("merchant-review:" + s.id)
          .digest("hex"),
        backend: {
          state: () => svc.orderView(svc.ownOrder(customer, orderId)),
          confirm: (key, amount) =>
            coordinator.confirm(customer, orderId, key, amount),
          recover: () => coordinator.recover(orderId),
          login: () => {
            throw Error("PUBLIC_ADMIN_DISABLED");
          },
          refund: async () => {
            throw Error("PUBLIC_ADMIN_DISABLED");
          },
          pdf: () => reportPdf(svc.getReport(customer, orderId)),
        },
      });
      const headers = new Headers(req.headers as HeadersInit);
      headers.set("host", new URL(internal).host);
      if (req.method !== "GET") headers.set("origin", internal);
      if (
        path === "/" &&
        req.method === "GET" &&
        headers.get("sec-fetch-mode") === "navigate" &&
        headers.get("sec-fetch-dest") === "document"
      )
        headers.set("sec-fetch-site", "none");
      const request = new Request(internal + (req.url || "/"), {
        method: req.method,
        headers,
        ...(req.method !== "GET"
          ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }
          : {}),
      } as RequestInit);
      const response = await handler(request);
      const outgoing: Record<string, string | string[]> = Object.fromEntries(
        response.headers,
      );
      const secure = origin.startsWith("https:") ? "; Secure" : "";
      const cookie = response.headers.get("set-cookie");
      if (cookie || fresh)
        outgoing["set-cookie"] = [
          ...(cookie ? [cookie + secure] : []),
          ...(fresh
            ? [
                `gs_review=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200${secure}`,
              ]
            : []),
        ];
      const body = Buffer.from(await response.arrayBuffer());
      const html = response.headers.get("content-type")?.includes("text/html");
      res.writeHead(response.status, outgoing);
      res.end(
        html
          ? body
              .toString("utf8")
              .replace(/<p><a href="\/admin">.*?<\/a><\/p>/, "")
              .replace("</main>", footer + "</main>")
          : body,
      );
    } catch {
      res.writeHead(503, { "Cache-Control": "no-store" });
      res.end("REVIEW_REQUEST_FAILED; no new payment requested");
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.listen(3212, "127.0.0.1", () =>
    console.log(
      "Isolated synthetic merchant review listening on loopback 3212",
    ),
  );
  const stop = () => {
    clearInterval(timer);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch(() => {
  console.error("MERCHANT_REVIEW_START_FAILED; settings suppressed");
  process.exitCode = 1;
});
