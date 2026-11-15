/** Aggregate-only probes. Never initialize/migrate a database or contact a provider. */
import { DatabaseSync } from "node:sqlite";
import { lstatSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export function workerIsHealthy(path: string, now = Date.now()) {
  let database: DatabaseSync | undefined;
  try {
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink()) return false;
    database = new DatabaseSync(path, { readOnly: true });
    const row = database
      .prepare("SELECT updated FROM worker_heartbeat WHERE name='reports'")
      .get() as { updated: number } | undefined;
    return (
      !!row &&
      Number.isSafeInteger(row.updated) &&
      row.updated <= now &&
      now - row.updated < 60000
    );
  } catch {
    return false;
  } finally {
    database?.close();
  }
}
async function main() {
  if (
    process.env.APP_MODE !== "local" ||
    process.env.EXTERNAL_EFFECTS !== "disabled"
  )
    throw Error("MODE_BLOCKED");
  if (process.argv[2] === "worker") {
    if (
      !process.env.DATABASE_PATH ||
      !workerIsHealthy(process.env.DATABASE_PATH)
    )
      throw Error("WORKER_UNHEALTHY");
  } else if (process.argv[2] === "web") {
    const response = await fetch("http://127.0.0.1:3000/api/health", {
      signal: AbortSignal.timeout(2500),
      redirect: "error",
    });
    const state = await response.json();
    if (
      !response.ok ||
      state.status !== "local-mock" ||
      state.externalEffects !== "disabled" ||
      state.launchReady !== false
    )
      throw Error("WEB_UNHEALTHY");
  } else throw Error("PROBE_REQUIRED");
  console.log("Local runtime probe: healthy");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error("LOCAL_RUNTIME_UNHEALTHY (details suppressed)");
    process.exitCode = 1;
  });
