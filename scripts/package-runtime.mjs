/** Build-once Linux runtime artifact. No env, database, dev source or provider credentials. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
const secretNames = [
  "DATA_KEY",
  "AUTH_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_TOTP_SECRET",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "TOSS_TEST_CLIENT_KEY",
  "TOSS_TEST_SECRET_KEY",
  "TOSS_TEST_WEBHOOK_SECURITY_KEY",
];
function inspect(root, secrets) {
  const records = [];
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name),
        relative = path.relative(root, file);
      if (item.name.startsWith(".env") || relative.split(path.sep)[0] === "var")
        throw Error("PRIVATE_RUNTIME_PATH");
      if (item.isSymbolicLink()) {
        const target = fs.readlinkSync(file);
        if (
          path.isAbsolute(target) ||
          !fs.realpathSync(file).startsWith(root + path.sep)
        )
          throw Error("UNSAFE_RUNTIME_SYMLINK");
        records.push({ path: relative, link: target });
      } else if (item.isDirectory()) visit(file);
      else if (item.isFile()) {
        const bytes = fs.readFileSync(file);
        if (
          secrets.some((s) => s.length >= 16 && bytes.includes(Buffer.from(s)))
        )
          throw Error("RUNTIME_SECRET_DETECTED");
        records.push({
          path: relative,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        });
      } else throw Error("UNSUPPORTED_RUNTIME_FILE");
    }
  }
  visit(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}
export function packageRuntime(source, destination, secrets = []) {
  const root = fs.realpathSync(source),
    out = path.resolve(destination);
  if (fs.existsSync(out)) throw Error("NEW_ARTIFACT_DIRECTORY_REQUIRED");
  const standalone = path.join(root, ".next/standalone");
  if (fs.lstatSync(standalone).isSymbolicLink())
    throw Error("UNSAFE_RUNTIME_SOURCE");
  inspect(standalone, secrets);
  for (const name of ["server.js"])
    if (!fs.existsSync(path.join(standalone, name)))
      throw Error("BUILD_REQUIRED");
  for (const name of [
    "dist/worker.js",
    "dist/runtime-health.js",
    "db/001-init.sql",
  ])
    if (!fs.existsSync(path.join(root, name)))
      throw Error("WORKER_BUILD_REQUIRED");
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  fs.mkdirSync(out, { mode: 0o700 });
  try {
    fs.cpSync(standalone, out, { recursive: true, verbatimSymlinks: true });
    for (const name of ["public", "assets", "db", "dist", ".next/static"])
      fs.cpSync(path.join(root, name), path.join(out, name), {
        recursive: true,
        verbatimSymlinks: true,
      });
    const manifest = {
      version: 1,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      mode: "local-mock",
      externalEffects: "disabled",
      files: inspect(out, secrets),
    };
    fs.writeFileSync(
      path.join(out, "runtime-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(out, "Dockerfile"),
      `FROM node:24-bookworm-slim AS runtime\nWORKDIR /app\nENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP_MODE=local EXTERNAL_EFFECTS=disabled DATABASE_PATH=/data/geumseo.sqlite\nCOPY --chown=node:node . .\nUSER node\nFROM runtime AS worker\nHEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node","dist/runtime-health.js","worker"]\nCMD ["node","dist/worker.js"]\nFROM runtime AS web\nEXPOSE 3000\nHEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node","dist/runtime-health.js","web"]\nCMD ["node","server.js"]\n`,
    );
    fs.writeFileSync(path.join(out, ".dockerignore"), ".env*\nvar\n");
    inspect(out, secrets);
    return { path: out, files: manifest.files.length, mode: manifest.mode };
  } catch (e) {
    fs.rmSync(out, { recursive: true, force: true });
    throw e;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
    if (process.argv.length !== 3) throw Error("DESTINATION_REQUIRED");
    console.log(
      JSON.stringify(
        packageRuntime(
          ".",
          process.argv[2],
          secretNames.map((n) => process.env[n] || "").filter(Boolean),
        ),
      ),
    );
  } catch {
    console.error(
      "RUNTIME_PACKAGE_FAILED (details suppressed; existing destinations never overwritten)",
    );
    process.exitCode = 1;
  }
}
