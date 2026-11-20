/** Public authenticated doorbell. Writes one fixed request file; never invokes a shell/Docker. */
import { createServer } from "node:http";
import {
  constants,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
  readFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  verifyUpdateIdentity,
  githubKeyCache,
  boundedJson,
  repository,
} from "./update-notify-identity.mjs";
const route = "/_internal/update-notify";
export function notificationHandler({
  requestFile,
  fetcher = fetch,
  keys = githubKeyCache(fetcher),
  now = () => Date.now(),
}) {
  let minute = 0,
    count = 0,
    lastSha = "",
    lastReleaseId = 0,
    busy = false;
  try {
    const prior = JSON.parse(readFileSync(requestFile, "utf8"));
    lastSha = prior.sha ?? "";
    lastReleaseId = Number.isSafeInteger(prior.releaseId) ? prior.releaseId : 0;
  } catch {}
  return async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    if (req.url !== route) return reply(404, { error: "NOT_FOUND" });
    if (req.method === "GET")
      return reply(200, { service: "gumseo-update-notify", version: 1 });
    if (req.method !== "POST")
      return reply(405, { error: "METHOD_NOT_ALLOWED" });
    const window = Math.floor(now() / 60000);
    if (window !== minute) {
      minute = window;
      count = 0;
    }
    if (++count > 30 || busy)
      return reply(429, { error: "UPDATE_NOTIFY_BUSY" });
    const authorization = req.headers.authorization ?? "";
    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ") ||
      authorization.length > 16400
    )
      return reply(401, { error: "UPDATE_IDENTITY_REQUIRED" });
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
      return reply(415, { error: "JSON_REQUIRED" });
    let ownsBusy = false;
    try {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) throw Error("BAD_REQUEST");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !body ||
        Object.keys(body).join(",") !== "sha" ||
        !/^[a-f0-9]{40}$/.test(body.sha)
      )
        throw Error("BAD_REQUEST");
      verifyUpdateIdentity(
        authorization.slice(7),
        await keys(),
        body.sha,
        Math.floor(now() / 1000),
      );
      if (busy) return reply(429, { error: "UPDATE_NOTIFY_BUSY" });
      busy = true;
      ownsBusy = true;
      if (lastSha === body.sha)
        return reply(202, { accepted: true, queued: false });
      const release = await boundedJson(
        "https://api.github.com/repos/" +
          repository +
          "/releases/tags/gumseo-mock-" +
          body.sha,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "gumseo-update-notify",
          },
        },
        fetcher,
      );
      if (
        !Number.isSafeInteger(release.id) ||
        release.id < 1 ||
        release.draft !== false ||
        release.prerelease !== true ||
        release.tag_name !== "gumseo-mock-" + body.sha ||
        !Array.isArray(release.assets) ||
        release.assets.filter((a) => a.name === "mock-release.tar").length !== 1
      )
        throw Error("RELEASE_NOT_PUBLISHED");
      if (release.id <= lastReleaseId)
        return reply(202, { accepted: true, queued: false });
      const fd = openSync(
        requestFile,
        constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_TRUNC |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeFileSync(
          fd,
          JSON.stringify({
            sha: body.sha,
            releaseId: release.id,
            received: now(),
          }) + "\n",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      lastSha = body.sha;
      lastReleaseId = release.id;
      return reply(202, { accepted: true, queued: true });
    } catch (error) {
      const rejected =
        error instanceof Error &&
        ["UPDATE_IDENTITY_REJECTED", "BAD_REQUEST"].includes(error.message);
      return reply(rejected ? 401 : 503, {
        error: rejected
          ? "UPDATE_IDENTITY_REJECTED"
          : "UPDATE_NOTIFY_UNAVAILABLE",
      });
    } finally {
      if (ownsBusy) busy = false;
    }
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const handler = notificationHandler({
    requestFile: "/requests/published.json",
  });
  const server = createServer({ maxHeaderSize: 32768 }, (req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(503);
      res.end();
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.listen(3461, "0.0.0.0", () =>
    console.log("UPDATE_NOTIFY_READY; no keys or tokens logged"),
  );
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
