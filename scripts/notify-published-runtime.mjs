/** Actions-only sender. GitHub issues a short-lived identity; no repository secret is needed. */
import {
  boundedJson,
  notifyEndpoint,
  repository,
  workflowRef,
} from "./update-notify-identity.mjs";

/** Diagnostic comparisons only: never return token contents, identity values, or headers. */
export function identityChecks(
  token,
  sha,
  now = Math.floor(Date.now() / 1000),
) {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return {
      issuer: claims.iss === "https://token.actions.githubusercontent.com",
      audience: claims.aud === notifyEndpoint,
      repository: claims.repository === repository,
      subject: claims.sub === "repo:" + repository + ":ref:refs/heads/main",
      ref: claims.ref === "refs/heads/main",
      workflow: claims.workflow_ref === workflowRef,
      sha: claims.sha === sha,
      event: ["push", "workflow_dispatch"].includes(claims.event_name),
      issued:
        Number.isSafeInteger(claims.iat) &&
        claims.iat <= now + 30 &&
        claims.iat >= now - 600,
      notBefore: Number.isSafeInteger(claims.nbf) && claims.nbf <= now + 30,
      expires: Number.isSafeInteger(claims.exp) && claims.exp > now,
      lifetime: claims.exp > claims.iat && claims.exp - claims.iat <= 600,
    };
  } catch {
    return { malformed: true };
  }
}
/** @param {Record<string,string|undefined>} [env] */
export async function notifyPublishedRuntime(
  env = process.env,
  fetcher = fetch,
) {
  const sha = env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || env.GITHUB_REF !== "refs/heads/main")
    throw Error("UPDATE_NOTIFY_MAIN_ONLY");
  // A first installation must not fail an otherwise valid package publication.
  try {
    const ready = await boundedJson(notifyEndpoint, {}, fetcher);
    if (ready.service !== "gumseo-update-notify" || ready.version !== 1)
      return { state: "not-installed" };
  } catch {
    return { state: "not-installed" };
  }
  const request = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL ?? "");
  if (
    request.protocol !== "https:" ||
    !request.hostname.endsWith(".actions.githubusercontent.com") ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  )
    throw Error("UPDATE_IDENTITY_REQUEST_UNAVAILABLE");
  request.searchParams.set("audience", notifyEndpoint);
  const identity = await boundedJson(
    request.href,
    {
      headers: {
        Authorization: "Bearer " + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
      },
    },
    fetcher,
  ).catch(() => {
    throw Error("UPDATE_IDENTITY_FETCH_FAILED");
  });
  if (typeof identity.value !== "string" || identity.value.length > 16384)
    throw Error("UPDATE_IDENTITY_REQUEST_UNAVAILABLE");
  const response = await fetcher(notifyEndpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: "Bearer " + identity.value,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sha }),
  }).catch(() => {
    throw Error("UPDATE_SIGNAL_NETWORK_FAILED");
  });
  if (response.status === 401)
    console.log(
      "UPDATE_IDENTITY_CHECKS " +
        JSON.stringify(identityChecks(identity.value, sha)),
    );
  if (response.status !== 202)
    throw Error("UPDATE_SIGNAL_HTTP_" + response.status);
  return { state: "accepted" };
}
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  notifyPublishedRuntime()
    .then((result) =>
      console.log(
        result.state === "accepted"
          ? "UPDATE_SIGNAL_ACCEPTED; deployment still requires server health checks"
          : "UPDATE_NOTIFY_NOT_INSTALLED; timer fallback remains active",
      ),
    )
    .catch((error) => {
      // Only fixed codes/numeric status, never arbitrary network errors or response bodies.
      const code =
        error instanceof Error &&
        /^(UPDATE_NOTIFY_MAIN_ONLY|UPDATE_IDENTITY_REQUEST_UNAVAILABLE|UPDATE_IDENTITY_FETCH_FAILED|UPDATE_SIGNAL_NETWORK_FAILED|UPDATE_SIGNAL_HTTP_[1-5][0-9]{2})$/.test(
          error.message,
        )
          ? error.message
          : "UPDATE_SIGNAL_FAILED";
      console.error(
        "::warning::" +
          code +
          "; timer fallback remains active. No token logged.",
      );
      process.exitCode = 1;
    });
