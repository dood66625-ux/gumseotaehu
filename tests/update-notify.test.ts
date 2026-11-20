import { afterEach, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  verifyUpdateIdentity,
  notifyEndpoint,
  repository,
  workflowRef,
} from "../scripts/update-notify-identity.mjs";
import { notificationHandler } from "../scripts/update-notify-server.mjs";
import { notifyPublishedRuntime } from "../scripts/notify-published-runtime.mjs";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...pair.publicKey.export({ format: "jwk" }),
  kid: "fixture-key",
  alg: "RS256",
};
const sha = "a".repeat(40),
  now = Math.floor(Date.now() / 1000);
const base = {
  iss: "https://token.actions.githubusercontent.com",
  aud: notifyEndpoint,
  repository,
  sub: "repo:" + repository + ":ref:refs/heads/main",
  ref: "refs/heads/main",
  workflow_ref: workflowRef,
  sha,
  event_name: "push",
  iat: now,
  nbf: now - 5,
  exp: now + 300,
};
function token(
  changes: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const parts = [
    { alg: "RS256", kid: "fixture-key", ...header },
    { ...base, ...changes },
  ].map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"));
  const input = parts.join(".");
  return (
    input +
    "." +
    sign("RSA-SHA256", Buffer.from(input), pair.privateKey).toString(
      "base64url",
    )
  );
}
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it("accepts a signed current main workflow identity without a shared secret", () => {
  expect(verifyUpdateIdentity(token(), [jwk], sha, now)).toEqual({ sha });
});
it.each([
  { aud: "other" },
  { repository: "other/repo" },
  { sub: "repo:other/repo:ref:refs/heads/main" },
  { ref: "refs/heads/other" },
  { workflow_ref: repository + "/.github/workflows/other.yml@refs/heads/main" },
  { sha: "b".repeat(40) },
  { iss: "https://evil.invalid" },
  { event_name: "pull_request" },
  { exp: now - 1 },
  { iat: now + 60 },
  { iat: now - 1000 },
  { exp: now + 1000 },
])("rejects identity mismatch/time %j", (changes) => {
  expect(() => verifyUpdateIdentity(token(changes), [jwk], sha, now)).toThrow(
    "UPDATE_IDENTITY_REJECTED",
  );
});
it("rejects algorithm confusion, unknown keys and forged signatures", () => {
  expect(() =>
    verifyUpdateIdentity(token({}, { alg: "HS256" }), [jwk], sha, now),
  ).toThrow();
  expect(() => verifyUpdateIdentity(token(), [], sha, now)).toThrow();
  const t = token();
  expect(() =>
    verifyUpdateIdentity(t.slice(0, -12) + "invalid", [jwk], sha, now),
  ).toThrow();
});
async function service(releaseAvailable = true) {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-notify-"));
  dirs.push(dir);
  const file = join(dir, "request.json");
  const metadata = vi.fn(async () =>
    Response.json({
      id: 1,
      draft: false,
      prerelease: true,
      tag_name: "gumseo-mock-" + sha,
      assets: releaseAvailable ? [{ name: "mock-release.tar" }] : [],
    }),
  );
  const handler = notificationHandler({
    requestFile: file,
    keys: async () => [jwk],
    fetcher: metadata as typeof fetch,
    now: () => now * 1000,
  });
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  const url = "http://127.0.0.1:" + address.port + "/_internal/update-notify";
  const post = (body: unknown = { sha }, identity = token()) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + identity,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const close = () =>
    new Promise<void>((r) => {
      server.close(() => r());
      server.closeAllConnections();
    });
  return { url, file, post, close, metadata };
}
it("readiness is public; missing/invalid authorization never writes the update flag or reads release metadata", async () => {
  const s = await service();
  try {
    expect(await (await fetch(s.url)).json()).toEqual({
      service: "gumseo-update-notify",
      version: 1,
    });
    expect((await fetch(s.url, { method: "POST" })).status).toBe(401);
    expect(
      (await s.post({ sha }, token({ ref: "refs/heads/not-main" }))).status,
    ).toBe(401);
    expect((await s.post({ sha, command: "sudo arbitrary" })).status).toBe(401);
    expect(existsSync(s.file)).toBe(false);
    expect(s.metadata).not.toHaveBeenCalled();
  } finally {
    await s.close();
  }
});
it("only a signed published package creates a fixed flag; replay does not write or query again", async () => {
  const s = await service();
  try {
    expect(await (await s.post()).json()).toEqual({
      accepted: true,
      queued: true,
    });
    const recorded = readFileSync(s.file, "utf8");
    expect(JSON.parse(recorded)).toEqual({
      sha,
      releaseId: 1,
      received: now * 1000,
    });
    expect(recorded).not.toContain("Bearer");
    expect(recorded).not.toContain(token());
    expect(await (await s.post()).json()).toEqual({
      accepted: true,
      queued: false,
    });
    expect(readFileSync(s.file, "utf8")).toBe(recorded);
    expect(s.metadata).toHaveBeenCalledOnce();
  } finally {
    await s.close();
  }
});
it("an unpublished artifact cannot queue privileged work", async () => {
  const s = await service(false);
  try {
    expect((await s.post()).status).toBe(503);
    expect(existsSync(s.file)).toBe(false);
  } finally {
    await s.close();
  }
});
it("sender skips an uninstalled receiver without minting identity", async () => {
  const http = vi.fn(async () => Response.json({ not: "the-notify-service" }));
  expect(
    await notifyPublishedRuntime(
      { GITHUB_SHA: sha, GITHUB_REF: "refs/heads/main" },
      http as typeof fetch,
    ),
  ).toEqual({ state: "not-installed" });
  expect(http).toHaveBeenCalledOnce();
});
it("sender mints a scoped identity only after readiness and sends only sha to the fixed endpoint", async () => {
  const jwt = token();
  const http = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ service: "gumseo-update-notify", version: 1 }),
    )
    .mockResolvedValueOnce(Response.json({ value: jwt }))
    .mockResolvedValueOnce(Response.json({ accepted: true }, { status: 202 }));
  const env = {
    GITHUB_SHA: sha,
    GITHUB_REF: "refs/heads/main",
    ACTIONS_ID_TOKEN_REQUEST_URL:
      "https://vstoken.actions.githubusercontent.com/fixture",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-bootstrap",
  };
  expect(await notifyPublishedRuntime(env, http as typeof fetch)).toEqual({
    state: "accepted",
  });
  expect(
    new URL(String(http.mock.calls[1][0])).searchParams.get("audience"),
  ).toBe(notifyEndpoint);
  expect(http.mock.calls[2][0]).toBe(notifyEndpoint);
  expect(http.mock.calls[2][1].body).toBe(JSON.stringify({ sha }));
});
it("sender never transmits the bootstrap credential to a foreign identity host", async () => {
  const http = vi.fn(async () =>
    Response.json({ service: "gumseo-update-notify", version: 1 }),
  );
  await expect(
    notifyPublishedRuntime(
      {
        GITHUB_SHA: sha,
        GITHUB_REF: "refs/heads/main",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://evil.invalid/",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-bootstrap",
      },
      http as typeof fetch,
    ),
  ).rejects.toThrow();
  expect(http).toHaveBeenCalledOnce();
});
