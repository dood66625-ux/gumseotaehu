import { spawnSync } from "node:child_process";
const hash = /^[a-f0-9]{40}$/;
/**
 * @param {Record<string, string | undefined>} [env]
 * @param {(args: string[]) => {status: number | null, stdout: string}} [git]
 */
export function merchantBuildInfo(
  env = process.env,
  git = (args) => spawnSync("git", args, { encoding: "utf8" }),
) {
  if (env.GITHUB_SHA !== undefined && !hash.test(env.GITHUB_SHA))
    throw Error("INVALID_MERCHANT_BUILD_REVISION");
  const head = git(["rev-parse", "HEAD"]),
    status = git(["status", "--porcelain", "--untracked-files=normal"]);
  const revision =
    head.status === 0 &&
    status.status === 0 &&
    !status.stdout.trim() &&
    hash.test(head.stdout.trim())
      ? head.stdout.trim()
      : null;
  if (revision && env.GITHUB_SHA && revision !== env.GITHUB_SHA)
    throw Error("MERCHANT_BUILD_REVISION_MISMATCH");
  return { version: 1, scope: "public-synthetic-review-assets", revision };
}
export function parseMerchantBuildInfo(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "revision,scope,version" ||
    value.version !== 1 ||
    value.scope !== "public-synthetic-review-assets" ||
    !(
      value.revision === null ||
      (typeof value.revision === "string" && hash.test(value.revision))
    )
  )
    throw Error("INVALID_MERCHANT_BUILD_INFO");
  return {
    version: 1,
    scope: "public-synthetic-review-assets",
    revision: value.revision,
  };
}
