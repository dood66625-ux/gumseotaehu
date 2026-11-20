/** Actions-only sender. GitHub issues a short-lived identity; no repository secret is needed. */
import { boundedJson, notifyEndpoint } from "./update-notify-identity.mjs";
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
  );
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
  });
  if (response.status !== 202) throw Error("UPDATE_SIGNAL_NOT_ACCEPTED");
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
    .catch(() => {
      console.error(
        "::warning::UPDATE_SIGNAL_FAILED; timer fallback remains active. No token logged.",
      );
      process.exitCode = 1;
    });
