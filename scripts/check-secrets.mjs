import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const names = [
  "DATA_KEY",
  "AUTH_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_TOTP_SECRET",
];
const files = execFileSync("git", ["ls-files", "-z"])
  .toString()
  .split("\0")
  .filter(Boolean);
let bad = false;
for (const f of files) {
  if (/(^|\/)\.env(?!\.example)|(^|\/)var\//.test(f)) {
    console.error("Forbidden tracked path:", f);
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
  `Checked ${files.length} tracked files: local key/password values absent; no environment/database files tracked.`,
);
