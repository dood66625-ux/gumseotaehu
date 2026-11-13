import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { config } from "../lib/config";
config();
process.env.DATABASE_PATH = "./var/e2e.sqlite";
for (const suffix of ["", "-wal", "-shm"])
  rmSync(process.env.DATABASE_PATH + suffix, { force: true });
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
const web = spawn(process.execPath, ["--import", "tsx", "scripts/start.ts"], {
    env,
    stdio: "inherit",
  }),
  worker = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    env,
    stdio: "inherit",
  });
function stop() {
  web.kill();
  worker.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", () => {
  worker.kill();
  process.exit();
});
