import { mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const name = process.argv[2];
if (!name || !/^[A-Za-z0-9_-]{1,60}$/.test(name))
  throw Error("Usage: npm run key:generate -- <safe-name>");
mkdirSync("var/keys", { recursive: true, mode: 0o700 });
chmodSync("var/keys", 0o700);
writeFileSync(`var/keys/${name}.key`, randomBytes(32).toString("hex") + "\n", {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Private DATA_KEY file generated under ignored var/keys. Value not printed. Existing application keys unchanged.",
);
