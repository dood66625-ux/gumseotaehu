import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
it("operating HTTPS hosts cannot print an admin OTP through the local development helper", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/admin-code.ts"],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        APP_MODE: "local",
        EXTERNAL_EFFECTS: "disabled",
        APP_ORIGIN: "https://operator.example.invalid",
        DATA_KEY: "b".repeat(64),
        AUTH_SECRET: "synthetic-signing-".repeat(3),
        ADMIN_PASSWORD: "synthetic-password-".repeat(3),
        ADMIN_TOTP_SECRET: "ab".repeat(20),
      },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("ADMIN_CODE_LOCAL_ONLY");
});
