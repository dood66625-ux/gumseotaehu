import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (
  process.argv.includes("--deployment-only") &&
  !process.argv.includes("--built")
)
  throw Error("DEPLOYMENT_BUILD_SCAN_REQUIRED");
const names = [
  "OPENAI_API_KEY",
  "DATA_KEY",
  "AUTH_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_TOTP_SECRET",
  "TOSS_TEST_CLIENT_KEY",
  "TOSS_TEST_SECRET_KEY",
  "TOSS_TEST_WEBHOOK_SECURITY_KEY",
];
const tracked = process.argv.includes("--deployment-only")
  ? []
  : execFileSync("git", ["ls-files", "-z"])
      .toString()
      .split("\0")
      .filter(Boolean);
const files = [...tracked];
if (process.argv.includes("--built")) {
  function collect(path) {
    if (!existsSync(path)) return;
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = path + "/" + item.name;
      if (item.isDirectory()) collect(child);
      else if (item.isFile()) files.push(child);
    }
  }
  for (const path of [
    "dist",
    ".next/static",
    ".next/standalone",
    "public",
    "var/public-preview",
  ])
    collect(path);
}
let bad = false;
for (const f of files) {
  if (tracked.includes(f) && /(^|\/)\.env(?!\.example)|(^|\/)var\//.test(f)) {
    console.error("Forbidden tracked path:", f);
    bad = true;
  }
  if (
    f.startsWith(".next/standalone/") &&
    (/(^|\/)\.env(?:\.|$)/.test(f) || f.startsWith(".next/standalone/var/"))
  ) {
    console.error("Forbidden deployment path:", f);
    bad = true;
  }
  const bytes = readFileSync(f);
  for (const k of names) {
    const v = process.env[k];
    if (v && v.length >= 16 && bytes.includes(Buffer.from(v))) {
      console.error(
        "Secret value detected; content suppressed. File:",
        f,
        "variable:",
        k,
      );
      bad = true;
    }
  }
}
if (bad) process.exit(1);
console.log(
  process.argv.includes("--deployment-only")
    ? `Checked ${files.length} deployment files: configured secret values absent; Git tracking check skipped explicitly.`
    : `Checked ${files.length} source/asset files: local key/password values absent; no environment/database files tracked.`,
);
