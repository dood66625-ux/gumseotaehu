import { expect, it } from "vitest";
import {
  merchantBuildInfo,
  parseMerchantBuildInfo,
} from "../scripts/merchant-build-info.mjs";
const revision = "a".repeat(40);
const git =
  (dirty = "") =>
  (args: string[]) => ({
    status: 0,
    stdout: args[0] === "rev-parse" ? revision + "\n" : dirty,
  });
it("records only the clean source commit and the public asset scope", () => {
  const info = merchantBuildInfo(
    { GITHUB_SHA: revision, UNRELATED_PRIVATE_VALUE: "must-not-be-copied" },
    git(),
  );
  expect(info).toEqual({
    version: 1,
    scope: "public-synthetic-review-assets",
    revision,
  });
  expect(parseMerchantBuildInfo(info)).toEqual(info);
});
it("does not label changed or unversioned local files as a clean commit", () => {
  expect(
    merchantBuildInfo({}, git(" M components/client.tsx\n")).revision,
  ).toBeNull();
  expect(
    merchantBuildInfo({}, () => ({ status: 128, stdout: "" })).revision,
  ).toBeNull();
});
it("rejects a malformed or mismatched CI revision without exposing values", () => {
  expect(() =>
    merchantBuildInfo({ GITHUB_SHA: "private-invalid-value" }, git()),
  ).toThrow("INVALID_MERCHANT_BUILD_REVISION");
  expect(() =>
    merchantBuildInfo({ GITHUB_SHA: "b".repeat(40) }, git()),
  ).toThrow("MERCHANT_BUILD_REVISION_MISMATCH");
});
it("rejects extra fields, invalid scope and unsafe revisions when reading public metadata", () => {
  for (const value of [
    { version: 1, scope: "private-app", revision },
    {
      version: 1,
      scope: "public-synthetic-review-assets",
      revision: "unsafe-value",
    },
    {
      version: 1,
      scope: "public-synthetic-review-assets",
      revision,
      credential: "private",
    },
    null,
  ])
    expect(() => parseMerchantBuildInfo(value)).toThrow(
      "INVALID_MERCHANT_BUILD_INFO",
    );
});
