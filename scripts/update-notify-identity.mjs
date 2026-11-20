/** GitHub OIDC verification with Node's RSA implementation. No stored/shared credentials. */
import { createPublicKey, verify } from "node:crypto";
export const notifyEndpoint = "https://gumseo.kr/_internal/update-notify";
export const repository = "dood66625-ux/gumseotaehu";
export const workflowRef =
  repository + "/.github/workflows/private-runtime.yml@refs/heads/main";
export function verifyUpdateIdentity(
  token,
  keys,
  sha,
  now = Math.floor(Date.now() / 1000),
) {
  const deny = () => {
    throw Error("UPDATE_IDENTITY_REJECTED");
  };
  if (
    typeof token !== "string" ||
    token.length > 16384 ||
    !/^[a-f0-9]{40}$/.test(sha)
  )
    deny();
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p) || p.length % 4 === 1)
  )
    deny();
  let header, claims, key;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      header.kid.length > 128
    )
      deny();
    const jwk = keys.find(
      (k) =>
        k.kid === header.kid &&
        k.kty === "RSA" &&
        (!k.alg || k.alg === "RS256") &&
        (!k.use || k.use === "sig"),
    );
    if (!jwk) deny();
    key = createPublicKey({ key: jwk, format: "jwk" });
    if (
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      !verify(
        "RSA-SHA256",
        Buffer.from(parts[0] + "." + parts[1]),
        key,
        Buffer.from(parts[2], "base64url"),
      )
    )
      deny();
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    deny();
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) deny();
  if (
    claims.iss !== "https://token.actions.githubusercontent.com" ||
    claims.aud !== notifyEndpoint ||
    claims.repository !== repository ||
    claims.sub !== "repo:" + repository + ":ref:refs/heads/main" ||
    claims.ref !== "refs/heads/main" ||
    claims.workflow_ref !== workflowRef ||
    claims.sha !== sha ||
    !["push", "workflow_dispatch"].includes(claims.event_name)
  )
    deny();
  if (
    ![claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger) ||
    claims.iat > now + 30 ||
    claims.nbf > now + 30 ||
    claims.exp <= now ||
    claims.iat < now - 600 ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 600
  )
    deny();
  return { sha };
}
export async function boundedJson(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("UPDATE_METADATA_UNAVAILABLE");
  const reader = response.body?.getReader();
  if (!reader) throw Error("UPDATE_METADATA_UNAVAILABLE");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) {
        await reader.cancel();
        throw Error("UPDATE_METADATA_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function githubKeyCache(fetcher = fetch) {
  let keys = [],
    fetched = 0;
  return async () => {
    if (Date.now() - fetched < 60000 && keys.length) return keys;
    const result = await boundedJson(
      "https://token.actions.githubusercontent.com/.well-known/jwks",
      {},
      fetcher,
    );
    if (!Array.isArray(result.keys) || result.keys.length > 20)
      throw Error("UPDATE_IDENTITY_KEYS_UNAVAILABLE");
    keys = result.keys;
    fetched = Date.now();
    return keys;
  };
}
