/** Real Caddy + real Next app + mock worker, loopback only, isolated synthetic credentials/DB. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { request, chromium, expect } from "@playwright/test";
const caddy = resolve(
  process.env.CADDY_EXECUTABLE || "var/staging/tools/caddy",
);
mkdirSync("var/staging", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve("var/staging/qa-"));
const password = "synthetic-" + randomUUID(),
  username = "owner-test";
const children: ChildProcess[] = [];
function start(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  const p = spawn(executable, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout?.resume();
  p.stderr?.resume();
  children.push(p);
  return p;
}
const origin = "https://localhost:3443";
const appEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PATH: process.env.PATH,
  APP_MODE: "local",
  EXTERNAL_EFFECTS: "disabled",
  APP_ORIGIN: origin,
  DATABASE_PATH: join(dir, "qa.sqlite"),
  DATA_KEY: randomBytes(32).toString("hex"),
  AUTH_SECRET: randomBytes(32).toString("hex"),
  ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  ADMIN_TOTP_SECRET: randomBytes(20).toString("hex"),
  PORT: "3340",
  GEUMSEO_BIND_HOST: "127.0.0.1",
  NEXT_TELEMETRY_DISABLED: "1",
};
const hashed = spawnSync(caddy, ["hash-password", "--plaintext", password], {
  encoding: "utf8",
});
if (hashed.status !== 0) throw Error("CADDY_HASH_FAILED");
const gateEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PATH: process.env.PATH,
  STAGING_SITE: origin,
  STAGING_BIND: "127.0.0.1",
  STAGING_USER: username,
  STAGING_PASSWORD_HASH: hashed.stdout.trim(),
  STAGING_UPSTREAM: "127.0.0.1:3340",
  XDG_DATA_HOME: join(dir, "caddy-data"),
  XDG_CONFIG_HOME: join(dir, "caddy-config"),
};
const valid = spawnSync(
  caddy,
  [
    "validate",
    "--config",
    "deploy/Caddyfile.private",
    "--adapter",
    "caddyfile",
  ],
  { env: gateEnv, encoding: "utf8" },
);
if (valid.status !== 0) throw Error("CADDY_CONFIG_FAILED");
const anonymous = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
});
const authorized = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  httpCredentials: { username, password, send: "always" },
  extraHTTPHeaders: { origin },
});
let phase = "startup";
try {
  start(process.execPath, ["--import", "tsx", "scripts/start.ts"], appEnv);
  start(process.execPath, ["--import", "tsx", "scripts/worker.ts"], appEnv);
  start(
    caddy,
    ["run", "--config", "deploy/Caddyfile.private", "--adapter", "caddyfile"],
    gateEnv,
  );
  await expect
    .poll(
      async () => {
        try {
          return (await authorized.get("/api/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  phase = "anonymous-access";
  for (const p of [
    "/",
    "/admin",
    "/api/health",
    "/api/local-mail/fake",
    "/_next/static/fake.js",
  ]) {
    const r = await anonymous.get(p);
    phase = "anonymous-status:" + p;
    expect(r.status()).toBe(401);
    expect(r.headers()["www-authenticate"]).toContain("Basic");
    phase = "anonymous-cache:" + p;
    expect(r.headers()["cache-control"]).toContain("no-store");
  }
  phase = "wrong-password";
  const wrong = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    httpCredentials: { username, password: "incorrect", send: "always" },
  });
  try {
    expect((await wrong.get("/")).status()).toBe(401);
  } finally {
    await wrong.dispose();
  }
  const post = async (p: string, data: unknown = {}) => {
    const r = await authorized.post("/api/" + p, { data });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const get = async (p: string) => {
    const r = await authorized.get("/api/" + p);
    expect(r.ok()).toBe(true);
    return r.json();
  };
  phase = "session";
  await post("session");
  const challenge = await post("auth/request", {
    email: "staging@example.invalid",
  });
  const code = await get("local-mail/" + challenge.challengeId);
  await post("auth/verify", {
    challengeId: challenge.challengeId,
    code: code.code,
  });
  phase = "reading";
  const reading = await post("readings", {
    name: "가상검증",
    date: "1995-05-15",
    calendar: "solar",
    leap: false,
    time: "10:30",
    sex: "female",
    place: "KR",
    age: "19+",
    self: true,
    consent: true,
  });
  phase = "mock-order";
  const order = await post("orders", {
    readingId: reading.id,
    consent: {
      terms: true,
      privacy: true,
      withdrawal: true,
      confirmedBirth: true,
      buyerAdult: true,
    },
  });
  const payment = await post("payments/authenticate", { orderId: order.id });
  await post("payments/confirm", {
    orderId: order.id,
    paymentKey: payment.paymentKey,
    amount: 22000,
  });
  await expect
    .poll(async () => (await get("orders/" + order.id)).fulfillment, {
      timeout: 20000,
    })
    .toBe("ready");
  phase = "pdf";
  const pdf = await authorized.get("/api/reports/" + order.id + "/pdf");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  phase = "csrf";
  const foreign = await authorized.post("/api/session", {
    headers: { origin: "https://outside.invalid" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  phase = "mobile";
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      ignoreHTTPSErrors: true,
      httpCredentials: { username, password },
    });
    const page = await context.newPage();
    let external = 0;
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        external++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(origin);
    await page.locator('a[href="/start"]').first().click();
    await page.waitForURL("**/start");
    await page.locator("form").waitFor();
    expect(external).toBe(0);
  } finally {
    await browser.close();
  }
  phase = "reauthentication";
  const report = await get("reports/" + order.id);
  const before = JSON.stringify(report);
  await post("logout");
  expect((await authorized.get("/api/reports/" + order.id)).status()).toBe(401);
  await post("session");
  const again = await post("auth/request", {
    email: "staging@example.invalid",
  });
  const againCode = await get("local-mail/" + again.challengeId);
  await post("auth/verify", {
    challengeId: again.challengeId,
    code: againCode.code,
  });
  expect(JSON.stringify(await get("reports/" + order.id))).toBe(before);
  const result = {
    loopbackOnly: true,
    syntheticOnly: true,
    caddyVersion: "2.11.9",
    tls: "local-internal-ca",
    anonymousDenied: true,
    wrongPasswordDenied: true,
    apiAndAssetsProtected: true,
    csrfEnforced: true,
    mockPurchase: true,
    pdf: true,
    emailReauthentication: true,
    reportUnchanged: true,
    mobileNavigation: true,
    noExternalRequests: true,
  };
  writeFileSync(
    "docs/private-staging-test.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "PRIVATE_STAGING_TEST_FAILED at " +
      phase +
      " (details/credentials suppressed)",
  );
  process.exitCode = 1;
} finally {
  await anonymous.dispose();
  await authorized.dispose();
  for (const p of children.reverse()) p.kill("SIGTERM");
  await Promise.all(
    children.map((p) =>
      p.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((r) => {
            p.once("exit", () => r());
            setTimeout(() => {
              p.kill("SIGKILL");
              r();
            }, 3000).unref();
          }),
    ),
  );
  rmSync(dir, { recursive: true, force: true });
}
