import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: [
    "scripts/worker.ts",
    "scripts/sales-enroll.ts",
    "scripts/toss-live-enroll.ts",
    "scripts/ai-worker-control.ts",
    "scripts/runtime-health.ts",
    "scripts/mail-status.ts",
    "scripts/retention-plan.ts",
    "scripts/runtime-backup.ts",
    "scripts/toss-sandbox.ts",
    "scripts/merchant-review.ts",
    "scripts/private-reader-server.ts",
  ],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["pdfkit", "lunar-javascript"],
  sourcemap: false,
});
console.log(
  "Worker and local health probes built; no environment values embedded.",
);

await import("./build-private-reader.mjs");

const salesSources = [];
function sourceFiles(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = dir + "/" + item.name;
    if (item.isDirectory()) sourceFiles(path);
    else if (item.isFile() && /\.(?:ts|tsx|mjs|sql)$/.test(item.name))
      salesSources.push(path);
  }
}
for (const dir of ["app", "components", "lib", "db", "scripts"])
  sourceFiles(dir);
salesSources.push(
  "docs/launch-progress.json",
  "package.json",
  "next.config.ts",
  "tsconfig.json",
);
salesSources.sort();
const salesHash = createHash("sha256");
for (const path of salesSources)
  salesHash.update(path).update("\0").update(readFileSync(path)).update("\0");
writeFileSync(
  "dist/sales-build-id.json",
  JSON.stringify({ version: 1, digest: salesHash.digest("hex") }),
);
