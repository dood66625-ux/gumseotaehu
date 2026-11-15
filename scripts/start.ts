import {
  cpSync,
  mkdirSync,
  existsSync,
  readdirSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { config } from "../lib/config";
const cfg = config(),
  target = resolve(".next/standalone");
// Refuse unsanitized builds (including ones created by bypassing npm's postbuild).
if (
  existsSync(target) &&
  (lstatSync(target).isSymbolicLink() ||
    realpathSync(target) !== target ||
    readdirSync(target).some(
      (name) => /^\.env(?:\.|$)/.test(name) || name === "var",
    ))
)
  throw Error("UNSANITIZED_STANDALONE_BUILD");
mkdirSync(target, { recursive: true });
for (const name of ["public", "db", "assets"])
  cpSync(name, resolve(target, name), { recursive: true });
cpSync(".next/static", resolve(target, ".next/static"), { recursive: true });
const server = spawn(process.execPath, ["server.js"], {
  cwd: target,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_PATH: resolve(cfg.db),
    HOSTNAME: process.env.GEUMSEO_BIND_HOST || "127.0.0.1",
    PORT: process.env.PORT || "3000",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
