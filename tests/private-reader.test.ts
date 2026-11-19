import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { Solar } from "lunar-javascript";
import { calculateLocal } from "../lib/astrology-core";
import { syntheticBirths } from "../lib/integrations/ai-synthetic-fixtures";
import { generate } from "../lib/interpretation";
import { createPrivateReader } from "../lib/private-reader";
const token = "a".repeat(43),
  origin = "http://127.0.0.1:3450";
function setup(fail = false) {
  const db = new DatabaseSync(":memory:");
  let calls = 0;
  const create = () =>
    createPrivateReader({
      db,
      origin,
      html: "<h1>private</h1>",
      assets: {},
      inviteDigest: createHash("sha256").update(token).digest("hex"),
      secret: Buffer.alloc(32, 1),
      key: Buffer.alloc(32, 2),
      generate: async (chart, locale, usage) => {
        calls++;
        if (fail) throw Error("secret provider error");
        usage(1000);
        return { ...generate(chart), provider: "openai" };
      },
    });
  return {
    db,
    app: create(),
    create,
    get calls() {
      return calls;
    },
  };
}
async function login(app: ReturnType<typeof setup>["app"]) {
  const r = await app(new Request(origin + "/private-reading/invite/" + token));
  expect(r.status).toBe(303);
  return r.headers.get("set-cookie")!.split(";")[0];
}
function request(
  cookie: string,
  birth: any = { ...syntheticBirths.known, place: "TW" },
  extra: any = {},
) {
  return new Request(origin + "/private-reading/generate", {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ locale: "zh-TW", consent: true, birth, ...extra }),
  });
}
it("Taipei UTC8 differs from Seoul UTC9 around Lichun and supports modern Taiwan dates", () => {
  const base = { ...syntheticBirths.known, date: "2024-02-04", time: "16:35" };
  expect(calculateLocal({ ...base, place: "TW" }).pillars[0]).toBe("甲辰");
  expect(calculateLocal({ ...base, place: "KR" }).pillars[0]).toBe("癸卯");
  expect(
    calculateLocal({ ...base, date: "1985-06-15", place: "TW" }).meta.timezone,
  ).toContain("Taipei");
  expect(() =>
    calculateLocal({ ...base, date: "1979-06-15", place: "TW" }),
  ).toThrow("SUPPORTED_YEAR_RANGE");
  const c = calculateLocal({
    ...base,
    date: "1995-05-15",
    time: null,
    place: "TW",
  });
  expect(c.pillars[3]).toBeNull();
  expect(c.cycles).toEqual([]);
});
it("private page requires a real invite and signed session; CSRF and absent consent do not spend", async () => {
  const s = setup();
  try {
    expect((await s.app(new Request(origin + "/private-reading"))).status).toBe(
      403,
    );
    expect(
      (
        await s.app(
          new Request(
            origin + "/private-reading/invite/" + token.slice(1) + "b",
          ),
        )
      ).status,
    ).toBe(404);
    const cookie = await login(s.app);
    const req = request(cookie, undefined, { consent: false });
    expect((await s.app(req)).status).toBe(400);
    const bad = request(cookie);
    bad.headers.set("origin", "https://evil.example");
    expect((await s.app(bad)).status).toBe(403);
    expect(s.calls).toBe(0);
  } finally {
    s.db.close();
  }
});
it("reopens encrypted results without extra AI calls and separates invite holders", async () => {
  const s = setup();
  try {
    const cookie = await login(s.app),
      res = await s.app(request(cookie));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report.chart.solarDate).toBeUndefined();
    expect((await s.app(request(cookie))).status).toBe(200);
    expect(s.calls).toBe(1);
    const stored = s.db.prepare("SELECT payload FROM private_readings").get()!
      .payload as string;
    expect(stored).not.toContain("chapters");
    expect(stored).not.toContain(syntheticBirths.known.date);
    const other = await login(s.app);
    expect(
      (
        await s.app(
          new Request(origin + "/private-reading/result/" + data.id, {
            headers: { cookie: other },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await s.app(
          new Request(origin + "/private-reading/latest", {
            headers: { cookie },
          }),
        )
      ).status,
    ).toBe(200);
  } finally {
    s.db.close();
  }
});
it("lost responses remain held and do not expose provider errors or retry", async () => {
  const s = setup(true);
  try {
    const cookie = await login(s.app);
    const a = await s.app(request(cookie));
    expect(a.status).toBe(409);
    expect(await a.text()).not.toContain("secret provider");
    expect((await s.app(request(cookie))).status).toBe(409);
    expect(s.calls).toBe(1);
    expect(s.db.prepare("SELECT state FROM ai_spend_calls").get()!.state).toBe(
      "uncertain",
    );
  } finally {
    s.db.close();
  }
});
it("private page refuses minors and lunar dates before API calls", async () => {
  const s = setup();
  try {
    const cookie = await login(s.app);
    expect(
      (
        await s.app(
          request(cookie, { ...syntheticBirths.known, date: "2015-01-01" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await s.app(
          request(cookie, { ...syntheticBirths.known, calendar: "lunar" }),
        )
      ).status,
    ).toBe(400);
    expect(s.calls).toBe(0);
  } finally {
    s.db.close();
  }
});

it("the private page lifetime budget refuses the eleventh distinct generation", async () => {
  const s = setup();
  try {
    const cookie = await login(s.app);
    for (let day = 10; day <= 20; day++) {
      const r = await s.app(
        request(cookie, {
          ...syntheticBirths.known,
          place: "TW",
          date: `1995-09-${day}`,
        }),
      );
      expect(r.status).toBe(day === 20 ? 429 : 200);
    }
    expect(s.calls).toBe(10);
    expect(s.db.prepare("SELECT count(*) n FROM ai_spend_calls").get()!.n).toBe(
      10,
    );
  } finally {
    s.db.close();
  }
});

it("restarting the private reader marks interrupted requests held without another call", async () => {
  const s = setup();
  try {
    const cookie = await login(s.app);
    await s.app(request(cookie));
    s.db.exec(
      "UPDATE private_readings SET state='running';UPDATE ai_spend_calls SET state='reserved'",
    );
    const restarted = s.create();
    const r = await restarted(
      new Request(origin + "/private-reading/latest", { headers: { cookie } }),
    );
    expect(r.status).toBe(409);
    expect(s.db.prepare("SELECT state FROM ai_spend_calls").get()!.state).toBe(
      "uncertain",
    );
    expect((await restarted(request(cookie))).status).toBe(409);
    expect(s.calls).toBe(1);
  } finally {
    s.db.close();
  }
});
