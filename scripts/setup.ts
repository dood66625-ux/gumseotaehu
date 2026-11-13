import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("var", { recursive: true, mode: 0o700 });
if (!existsSync(".env.local")) {
  writeFileSync(
    ".env.local",
    `APP_MODE=local\nAPP_ORIGIN=http://localhost:3000\nDATABASE_PATH=./var/geumseo.sqlite\nDATA_KEY=${randomBytes(32).toString("hex")}\nAUTH_SECRET=${randomBytes(32).toString("hex")}\nADMIN_PASSWORD=${randomBytes(24).toString("base64url")}\nADMIN_TOTP_SECRET=${randomBytes(20).toString("hex")}\nREPORT_YEAR=2027\nEXTERNAL_EFFECTS=disabled\n`,
    { mode: 0o600 },
  );
  console.log(
    "Local secrets created in ignored .env.local (0600). No values printed.",
  );
} else console.log("Existing .env.local preserved.");
