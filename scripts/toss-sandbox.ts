/** Explicit, loopback-only test SDK/server. No real customer inputs, AI or email transport. */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { config } from "../lib/config";
import { one, closeDb } from "../lib/db";
import * as svc from "../lib/service";
import { loginAdmin } from "../lib/admin-auth";
import { reportPdf } from "../lib/pdf";
import { Fault } from "../lib/security";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import { tossTestKeyPair } from "../lib/integrations/toss-key-profile.mjs";
import { TossTestContract } from "../lib/integrations/toss";
import { TossOrderCoordinator } from "../lib/integrations/toss-orders";
import { createTossTestTransport } from "../lib/integrations/toss-http";
import { createTossSandboxHandler } from "../lib/integrations/toss-sandbox-web";

async function main() {
  if (process.argv.slice(2).join(" ") !== "--test-network")
    throw Error("EXPLICIT_TEST_NETWORK_FLAG_REQUIRED");
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  config(); // Still requires local/disabled; never enables normal app effects.
  if (
    tossTestKeyPair(
      process.env.TOSS_TEST_CLIENT_KEY,
      process.env.TOSS_TEST_SECRET_KEY,
    ) !== "widget"
  )
    throw Error("WIDGET_TEST_KEYS_REQUIRED");
  const directory = resolve("var/toss-sandbox");
  for (const d of [resolve("var"), directory]) {
    mkdirSync(d, { recursive: true, mode: 0o700 });
    if (
      !lstatSync(d).isDirectory() ||
      lstatSync(d).isSymbolicLink() ||
      realpathSync(d) !== d
    )
      throw Error("UNSAFE_SANDBOX_DIRECTORY");
    chmodSync(d, 0o700);
  }
  process.env.DATABASE_PATH = "./var/toss-sandbox/journey.sqlite";
  if (
    existsSync(process.env.DATABASE_PATH) &&
    (!lstatSync(process.env.DATABASE_PATH).isFile() ||
      lstatSync(process.env.DATABASE_PATH).isSymbolicLink())
  )
    throw Error("UNSAFE_SANDBOX_DATABASE");
  const expectedDb = resolve(process.env.DATABASE_PATH);
  if (resolve(config().db) !== expectedDb)
    throw Error("ISOLATED_DATABASE_REQUIRED");
  const initial = svc.newSession();
  const cid = svc.requestOtp(initial.session, "toss-synthetic@example.invalid");
  svc.verifyOtp(initial.session, cid, svc.localOtp(initial.session, cid).code);
  const customer = one<svc.Session>(
    "SELECT * FROM sessions WHERE id=?",
    initial.session.id,
  )!;
  let order = svc.listOrders(customer)[0];
  if (!order) {
    const reading = svc.makeReading(customer, syntheticBirths.known);
    const id = svc.createOrder(customer, reading, {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    });
    order = svc.orderView(svc.ownOrder(customer, id));
  }
  const orderId = order.id;
  // Only this fixed fixture can ever be authorized by this separate server.
  const fixture = svc.readingFor(
    customer,
    svc.ownOrder(customer, orderId).reading_id,
  );
  if (
    !isDeepStrictEqual(fixture.input, syntheticBirths.known) ||
    order.amount !== 22000
  )
    throw Error("SYNTHETIC_ORDER_REQUIRED");
  const mid = process.env.TOSS_TEST_MID?.trim();
  if (mid && !/^[A-Za-z0-9_-]{1,100}$/.test(mid))
    throw Error("INVALID_TEST_MID");
  const coordinator = mid
    ? new TossOrderCoordinator(
        new TossTestContract(
          process.env.TOSS_TEST_SECRET_KEY!,
          createTossTestTransport({ enabled: true }),
        ),
        mid,
      )
    : undefined;
  let admin: svc.Session | undefined;
  const requireGateway = () => {
    if (!coordinator)
      throw new Fault("상점아이디(MID) 설정이 필요합니다.", 503);
    return coordinator;
  };
  const handler = createTossSandboxHandler({
    origin: "http://127.0.0.1:3211",
    clientKey: process.env.TOSS_TEST_CLIENT_KEY!,
    merchantConfigured: !!mid,
    clientScript: readFileSync("scripts/toss-sandbox-client.mjs", "utf8"),
    backend: {
      state: () => svc.orderView(svc.ownOrder(customer, orderId)),
      confirm: (key, amount) =>
        requireGateway().confirm(customer, orderId, key, amount),
      recover: () => requireGateway().recover(orderId),
      login: (password, code) => {
        const operator = svc.newSession();
        const token = loginAdmin(operator.session, password, code);
        admin = svc.sessionFor(token)!;
      },
      refund: () => {
        if (!admin) throw new Fault("관리자 인증이 필요합니다.", 403);
        return requireGateway().refund(
          admin,
          orderId,
          "가상 주문 테스트 전액 취소",
        );
      },
      pdf: () => reportPdf(svc.getReport(customer, orderId)),
    },
  });
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await coordinator?.recoverPending();
      svc.workOnce();
      svc.reconcileRefunds();
    } catch {
      console.error("SANDBOX_WORKER_CHECK_REQUIRED (details suppressed)");
    } finally {
      busy = false;
    }
  }, 2000);
  const server = createServer(async (req, res) => {
    try {
      const request = new Request("http://127.0.0.1:3211" + (req.url || "/"), {
        method: req.method,
        headers: req.headers as HeadersInit,
        ...(!["GET", "HEAD"].includes(req.method || "GET")
          ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }
          : {}),
      } as RequestInit);
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(503, { "Cache-Control": "no-store" });
      res.end("SANDBOX_REQUEST_FAILED");
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.listen(3211, "127.0.0.1", () =>
    console.log(
      "Synthetic Toss QA: http://127.0.0.1:3211 — test keys only; no actual charge; MID " +
        (mid ? "configured" : "missing (SDK rendering only)"),
    ),
  );
  const stop = () => {
    clearInterval(timer);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("error", () => {
    clearInterval(timer);
    console.error("SANDBOX_SERVER_FAILED (details suppressed)");
    closeDb();
    process.exitCode = 1;
  });
}
main().catch(() => {
  console.error(
    "SANDBOX_START_FAILED: configuration values suppressed; no payment request made.",
  );
  process.exitCode = 1;
});
