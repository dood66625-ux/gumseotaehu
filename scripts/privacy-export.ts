import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { all } from "../lib/db";
import { config } from "../lib/config";
import { encodeDeletions } from "../lib/deletion-manifest";
const target = process.argv[2];
if (!target)
  throw Error("Usage: npm run privacy:export -- <NEW private manifest path>");
mkdirSync(dirname(resolve(target)), { recursive: true, mode: 0o700 });
const rows = all(
  "SELECT order_id AS orderId,deleted_at AS deletedAt FROM deletion_tombstones ORDER BY order_id",
) as { orderId: string; deletedAt: number }[];
writeFileSync(target, encodeDeletions(rows, config().key), {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Signed deletion manifest exported; keep the latest copy separately from old backups. No external upload.",
);
