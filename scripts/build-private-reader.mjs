import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("public/private-reader", { recursive: true });
copyFileSync(
  "public/brand/geumseo-logo-v1.webp",
  "public/private-reader/geumseo-logo-v1.webp",
);
await build({
  entryPoints: ["scripts/private-reader/client.ts"],
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  outfile: "public/private-reader/reader.js",
});
copyFileSync(
  "scripts/private-reader/style.css",
  "public/private-reader/style.css",
);
console.log("Private reader assets built without credentials.");

copyFileSync(
  "scripts/private-reader/index.html",
  "public/private-reader/index.html",
);

for (const weight of ["regular", "bold"])
  copyFileSync(
    `public/korean-reading-${weight}.woff2`,
    `public/private-reader/korean-reading-${weight}.woff2`,
  );
