import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { db, closeDb } from "../lib/db";
import { hash, seal } from "../lib/security";
import { newAdminToken } from "../lib/admin-token";
import { GET } from "../app/api/[...path]/route";
import { POST } from "../app/api/usage/route";
let directory: string;
const order = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  closeDb();
  directory = mkdtempSync(join(tmpdir(), "gumseo-visitors-"));
  for (const [key, value] of Object.entries({
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    APP_ORIGIN: "http://localhost:3100",
    DATABASE_PATH: join(directory, "test.sqlite"),
    DATA_KEY: "a".repeat(64),
    AUTH_SECRET: "synthetic-secret-".repeat(4),
    ADMIN_PASSWORD: "synthetic-password-".repeat(3),
    ADMIN_TOTP_SECRET: "ab".repeat(20),
    CLIENT_IP_PROTECTION: "disabled",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function token(role: string, age = 0) {
  const t = role === "customer" ? "synthetic-customer-token" : newAdminToken();
  const id = hash(t),
    now = Date.now();
  db()
    .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
    .run(id, null, role, now + 3600000, now);
  db()
    .prepare("INSERT INTO admin_auth VALUES(?,?)")
    .run(id, now - age);
  return t;
}
function read(path: string, t?: string) {
  return GET(
    new NextRequest("http://localhost:3100/api/" + path, {
      headers: t ? { cookie: "gs_session=" + t } : {},
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}
function reportFixture() {
  const d = db(),
    now = Date.now();
  d.prepare("INSERT INTO readings VALUES(?,?,?,?,?,?,?)").run(
    "r",
    "s",
    "19+",
    seal({ name: "가온" }),
    seal({}),
    seal({}),
    now,
  );
  d.prepare(
    "INSERT INTO orders(id,reading_id,email_hash,email_enc,amount,payment_status,fulfillment,created,paid_at,expires,consent_enc) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    order,
    "r",
    "email",
    seal("synthetic@example.invalid"),
    22000,
    "paid",
    "ready",
    now,
    now,
    now + 86400000,
    seal({}),
  );
  d.prepare("INSERT INTO reports VALUES(?,?,?,?,?)").run(
    "report",
    order,
    1,
    seal({
      intro: "stored-synthetic-report",
      chapters: [],
      chart: { element: "목" },
    }),
    now,
  );
}
it("denies anonymous, customer and finance access to visitor details", async () => {
  expect((await read("admin/visitors")).status).toBe(401);
  expect((await read("admin/visitors", token("customer"))).status).toBe(403);
  expect((await read("admin/visitors", token("finance"))).status).toBe(403);
});
it("requires recent operations authentication and audits saved report access", async () => {
  reportFixture();
  const t = token("operations");
  const response = await read("admin/visitor-report/" + order, t);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).report.intro).toBe("stored-synthetic-report");
  expect(
    db()
      .prepare(
        "SELECT count(*) AS n FROM audit WHERE action='admin_report_view'",
      )
      .get()!.n,
  ).toBe(1);
  db()
    .prepare("UPDATE admin_auth SET verified_at=?")
    .run(Date.now() - 11 * 60000);
  expect((await read("admin/visitor-report/" + order, t)).status).toBe(401);
});
it("does not reveal deleted or expired reports", async () => {
  reportFixture();
  const t = token("operations");
  db().prepare("UPDATE orders SET content_deleted=1").run();
  expect((await read("admin/visitor-report/" + order, t)).status).toBe(410);
  db()
    .prepare("UPDATE orders SET content_deleted=0,expires=?")
    .run(Date.now() - 1);
  expect((await read("admin/visitor-report/" + order, t)).status).toBe(410);
});
it("only accepts first-party finite events and never client conversion claims", async () => {
  const send = (origin: string, body: unknown) =>
    POST(
      new NextRequest("http://localhost:3100/api/usage", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  expect(
    (await send("https://evil.example", { stage: "landing" })).status,
  ).toBe(403);
  expect(
    (await send("http://localhost:3100", { stage: "paid", orderId: order }))
      .status,
  ).toBe(400);
  const accepted = await send("http://localhost:3100", {
    stage: "landing",
    referrer: "https://search.example/private?token=secret",
  });
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get("set-cookie")).toContain("HttpOnly");
  const v = db().prepare("SELECT * FROM visits").get()!;
  expect(v.source).toBe("search.example");
  expect(JSON.stringify(v)).not.toContain("secret");
});
