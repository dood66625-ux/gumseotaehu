import { expect, it } from "vitest";
import { launchReadiness } from "../lib/readiness";
it("reports incomplete implementation separately from missing accounts and never exposes secrets", () => {
  const report = launchReadiness();
  expect(report.launchReady).toBe(false);
  expect(report.externalEffectsEnabled).toBe(false);
  expect(report.blockers.map((x) => x.id)).toEqual(
    expect.arrayContaining([
      "toss",
      "ai",
      "mail",
      "privacy",
      "admin",
      "approval",
    ]),
  );
  const text = JSON.stringify(report);
  for (const name of [
    "OPENAI_API_KEY",
    "DATA_KEY",
    "AUTH_SECRET",
    "ADMIN_PASSWORD",
    "ADMIN_TOTP_SECRET",
    "TOSS_TEST_SECRET_KEY",
  ]) {
    const secret = process.env[name];
    if (secret) expect(text).not.toContain(secret);
  }
  expect(text).not.toContain("mjreview3@");
});
