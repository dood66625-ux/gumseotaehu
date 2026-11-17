import { build } from "esbuild";
import { mkdirSync } from "node:fs";
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: [
    "scripts/worker.ts",
    "scripts/runtime-health.ts",
    "scripts/mail-status.ts",
    "scripts/runtime-backup.ts",
    "scripts/toss-sandbox.ts",
    "scripts/merchant-review.ts",
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
