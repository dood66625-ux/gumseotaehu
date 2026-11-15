import { tossTestKeyPair } from "../lib/integrations/toss-key-profile.mjs";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const client = process.env.TOSS_TEST_CLIENT_KEY;
const secret = process.env.TOSS_TEST_SECRET_KEY;
if (!client || !secret) {
  console.log(
    "Toss test keys: not configured. Runtime remains mock-only. No network request made.",
  );
  process.exitCode = 1;
} else {
  try {
    const kind = tossTestKeyPair(client, secret);
    console.log(
      `Toss test key shape: OK (${kind}). Merchant/key validity NOT verified. Runtime remains mock-only. No network request made.`,
    );
  } catch {
    console.error(
      "Invalid/mixed test key family. Values suppressed. Live keys are not accepted.",
    );
    process.exitCode = 1;
  }
}
