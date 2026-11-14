import { afterEach, expect, it, vi } from "vitest";
import { config } from "../lib/config";
afterEach(() => vi.unstubAllEnvs());
it("rejects malformed MFA secret rather than silently truncating hex", () => {
  vi.stubEnv("ADMIN_TOTP_SECRET", "not-hex-".repeat(10));
  expect(() => config()).toThrow("INVALID_ADMIN_TOTP");
});
it.each([
  "https://example.invalid/path",
  "https://name:pass@example.invalid",
  "javascript:alert(1)",
])("rejects non-origin configuration %s", (origin) => {
  vi.stubEnv("APP_ORIGIN", origin);
  expect(() => config()).toThrow("INVALID_APP_ORIGIN");
});
it("rejects unsupported report product year and non-SQLite URL", () => {
  vi.stubEnv("REPORT_YEAR", "NaN");
  expect(() => config()).toThrow("UNSUPPORTED_PRODUCT_YEAR");
  vi.stubEnv("REPORT_YEAR", "2027");
  vi.stubEnv("DATABASE_PATH", "postgres://not-a-configured-adapter");
  expect(() => config()).toThrow("SQLITE_PATH_REQUIRED");
});
