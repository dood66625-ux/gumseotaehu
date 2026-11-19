import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("public/private-reader", { recursive: true });
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
