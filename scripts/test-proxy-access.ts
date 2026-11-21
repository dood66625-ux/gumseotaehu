/** Real local TLS reverse proxy + application; disposable synthetic DB/credentials only. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { networkInterfaces } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { request, expect } from "@playwright/test";
const caddy = resolve(
  process.env.CADDY_EXECUTABLE || "var/staging/tools/caddy",
);
mkdirSync("var/staging", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve("var/staging/proxy-"));
const token = randomBytes(32).toString("hex"),
  password = randomBytes(24).toString("hex"),
  secret = randomBytes(32).toString("hex");
const origin = "https://127.0.0.1:3447",
  database = join(dir, "test.sqlite");
const children: ChildProcess[] = [];
const base = {
  NODE_ENV: "production",
  PATH: process.env.PATH,
} as NodeJS.ProcessEnv;
let phase = "startup";
const proxied = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  httpCredentials: { username: "synthetic", password, send: "always" },
  extraHTTPHeaders: { origin },
});
const direct = await request.newContext({ baseURL: "http://127.0.0.1:3347" });
function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, stdio: "ignore" });
  children.push(child);
  return child;
}
try {
  const hashed = spawnSync(caddy, ["hash-password", "--plaintext", password], {
    encoding: "utf8",
  });
  if (hashed.status !== 0) throw Error("CADDY_HASH_FAILED");
  if (
    spawnSync(
      caddy,
      [
        "adapt",
        "--config",
        "deploy/iwinv/Caddyfile.operator-proxy.example",
        "--adapter",
        "caddyfile",
      ],
      { env: { ...base, TRUSTED_PROXY_TOKEN: token }, stdio: "ignore" },
    ).status !== 0
  )
    throw Error("OPERATOR_PROXY_TEMPLATE_INVALID");
  const gate = {
    ...base,
    STAGING_SITE: origin,
    STAGING_BIND: "127.0.0.1",
    STAGING_USER: "synthetic",
    STAGING_PASSWORD_HASH: hashed.stdout.trim(),
    STAGING_UPSTREAM: "127.0.0.1:3347",
    TRUSTED_PROXY_TOKEN: token,
    XDG_DATA_HOME: join(dir, "tls"),
    XDG_CONFIG_HOME: join(dir, "config"),
  };
  if (
    spawnSync(
      caddy,
      [
        "validate",
        "--config",
        "deploy/Caddyfile.private",
        "--adapter",
        "caddyfile",
      ],
      { env: gate, stdio: "ignore" },
    ).status !== 0
  )
    throw Error("CADDY_CONFIG_FAILED");
  start(process.execPath, ["--import", "tsx", "scripts/start.ts"], {
    ...base,
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    APP_ORIGIN: origin,
    DATABASE_PATH: database,
    DATA_KEY: randomBytes(32).toString("hex"),
    AUTH_SECRET: secret,
    ADMIN_PASSWORD: randomBytes(32).toString("hex"),
    ADMIN_TOTP_SECRET: randomBytes(20).toString("hex"),
    PORT: "3347",
    GEUMSEO_BIND_HOST: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    CLIENT_IP_PROTECTION: "trusted-proxy",
    TRUSTED_PROXY_TOKEN: token,
  });
  start(
    caddy,
    ["run", "--config", "deploy/Caddyfile.private", "--adapter", "caddyfile"],
    gate,
  );
  await expect
    .poll(
      async () => {
        try {
          return (await proxied.get("/api/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  phase = "direct-route";
  expect((await direct.get("/api/session")).status()).toBe(403);
  expect(
    (
      await direct.get("/api/session", {
        headers: {
          "x-gumseo-proxy-token": "0".repeat(64),
          "x-gumseo-client-ip": "192.0.2.1",
        },
      })
    ).status(),
  ).toBe(403);
  // Verify the local app socket is inaccessible through this machine's non-loopback interface.
  const address = Object.values(networkInterfaces())
    .flat()
    .find((v) => v?.family === "IPv4" && !v.internal)?.address;
  if (!address) throw Error("NON_LOOPBACK_CHECK_UNAVAILABLE");
  let connected = false;
  try {
    await direct.get(`http://${address}:3347/api/health`, { timeout: 1500 });
    connected = true;
  } catch {}
  expect(connected).toBe(false);
  phase = "header-overwrite";
  const response = await proxied.get("/api/session", {
    headers: {
      "x-gumseo-proxy-token": "f".repeat(64),
      "x-gumseo-client-ip": "192.0.2.99",
      "x-forwarded-for": "192.0.2.98",
      forwarded: "for=192.0.2.97",
    },
  });
  expect(response.status()).toBe(200);
  expect(
    JSON.stringify(response.headers()) + (await response.text()),
  ).not.toContain(token);
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const bucket = (ip: string) =>
      createHmac("sha256", secret)
        .update("proxy:all:" + ip)
        .digest("hex");
    expect(
      db
        .prepare("SELECT count FROM rate_limits WHERE key=?")
        .get(bucket("127.0.0.1"))?.count,
    ).toBe(1);
    expect(
      db
        .prepare("SELECT count FROM rate_limits WHERE key=?")
        .get(bucket("192.0.2.99")),
    ).toBeUndefined();
    expect(
      JSON.stringify(db.prepare("SELECT * FROM rate_limits").all()),
    ).not.toContain("127.0.0.1");
  } finally {
    db.close();
  }
  phase = "authentication-rate";
  for (let i = 0; i < 15; i++)
    expect(
      (await proxied.post("/api/auth/request", { data: {} })).status(),
    ).toBe(401);
  expect((await proxied.post("/api/auth/request", { data: {} })).status()).toBe(
    429,
  );
  phase = "financial-rate";
  for (let i = 0; i < 30; i++)
    expect(
      (await proxied.post("/api/payments/unknown", { data: {} })).status(),
    ).toBe(401);
  expect(
    (await proxied.post("/api/payments/unknown", { data: {} })).status(),
  ).toBe(429);
  phase = "aggregate-rate";
  // The first session request + 16 auth attempts and 31 financial attempts already consumed 48 of 240 requests.
  for (let i = 48; i < 240; i++)
    expect((await proxied.get("/api/session")).status()).toBe(200);
  expect((await proxied.get("/api/session")).status()).toBe(429);
  expect((await proxied.get("/api/health")).status()).toBe(200);
  console.log(
    JSON.stringify({
      syntheticOnly: true,
      realLocalCaddy: true,
      headerOverwrite: true,
      directUnauthorizedDenied: true,
      localNonLoopbackDenied: true,
      rawIpNotStored: true,
      authLimit: true,
      financialLimit: true,
      aggregateLimit: true,
      healthAvailable: true,
      productionVerified: false,
    }),
  );
} catch {
  console.error(
    "PROXY_ACCESS_TEST_FAILED at " +
      phase +
      " (details and credentials suppressed)",
  );
  process.exitCode = 1;
} finally {
  await proxied.dispose();
  await direct.dispose();
  for (const child of children.reverse()) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((done) => {
            child.once("exit", () => done());
            setTimeout(() => {
              child.kill("SIGKILL");
              done();
            }, 3000).unref();
          }),
    ),
  );
  rmSync(dir, { recursive: true, force: true });
}
