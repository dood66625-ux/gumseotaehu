import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const client = process.env.TOSS_TEST_CLIENT_KEY;
const secret = process.env.TOSS_TEST_SECRET_KEY;
if (!client || !secret) {
  console.log("Toss test keys: not configured. Runtime remains mock-only. No network request made.");
  process.exitCode = 1;
} else if (!/^test_ck_[A-Za-z0-9_]+$/.test(client) || !/^test_sk_[A-Za-z0-9_]+$/.test(secret)) {
  console.error("Invalid test key format. Values suppressed. Live keys are not accepted.");
  process.exitCode = 1;
} else {
  console.log("Toss test key format: OK. Credential validity NOT verified. Runtime remains mock-only. No network request made.");
}
