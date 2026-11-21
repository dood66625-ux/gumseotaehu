import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { newAdminToken, validAdminToken } from "../lib/admin-token";
beforeEach(() => {
  for (const [key, value] of Object.entries({
    APP_MODE: "local",
    EXTERNAL_EFFECTS: "disabled",
    APP_ORIGIN: "https://operator.example.invalid",
    DATA_KEY: "b".repeat(64),
    AUTH_SECRET: "synthetic-signing-".repeat(3),
    ADMIN_PASSWORD: "synthetic-password-".repeat(3),
    ADMIN_TOTP_SECRET: "ab".repeat(20),
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it("requires a complete administrator signature and rejects an edited nonce or MAC", () => {
  const token = newAdminToken();
  expect(validAdminToken(token)).toBe(true);
  const [prefix, nonce, mac] = token.split(".");
  expect(
    validAdminToken(
      prefix +
        "." +
        (nonce[0] === "a" ? "b" : "a") +
        nonce.slice(1) +
        "." +
        mac,
    ),
  ).toBe(false);
  expect(
    validAdminToken(
      prefix + "." + nonce + "." + (mac[0] === "a" ? "b" : "a") + mac.slice(1),
    ),
  ).toBe(false);
  expect(validAdminToken("legacy-customer-token")).toBe(false);
});
it.each([
  ["ADMIN_PASSWORD", "different-password-".repeat(3)],
  ["ADMIN_TOTP_SECRET", "ef".repeat(20)],
  ["AUTH_SECRET", "different-signing-".repeat(3)],
  ["APP_ORIGIN", "https://other.example.invalid"],
])("binds elevated cookies to current %s", (key, value) => {
  const token = newAdminToken();
  vi.stubEnv(key, value);
  expect(validAdminToken(token)).toBe(false);
});
