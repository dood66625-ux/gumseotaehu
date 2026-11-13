import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { db } from "../lib/db";
mkdirSync("var/backups", { recursive: true, mode: 0o700 });
const path = "var/backups/geumseo-" + Date.now() + ".sqlite";
await backup(db(), path);
console.log(
  "Consistent local backup created:",
  path,
  "Keep encryption keys separately; no external upload.",
);
