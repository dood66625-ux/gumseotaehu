import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { readPrivateKey } from "../lib/private-key-file";
import { config } from "../lib/config";
import {
  decodeDeletions,
  encodeDeletions,
  type Deletions,
} from "../lib/deletion-manifest";
import { rotateDataKey } from "../lib/key-rotation";
const [target, keyFlag, keyFile, deleteFlag, manifest, offline, ...extra] =
  process.argv.slice(2);
if (
  !target ||
  keyFlag !== "--new-key-file" ||
  !keyFile ||
  deleteFlag !== "--deletions" ||
  !manifest ||
  offline !== "--offline" ||
  extra.length
)
  throw Error(
    "Usage: npm run key:rotate -- <NEW database> --new-key-file <private key file> --deletions <LATEST signed manifest> --offline",
  );
if (statSync(manifest).size > 16 * 1024 * 1024)
  throw Error("DELETIONS_TOO_LARGE");
if (existsSync(target + ".deletions.json"))
  throw Error("ROTATION_MANIFEST_EXISTS");
const cfg = config(),
  next = readPrivateKey(keyFile),
  deletions = decodeDeletions(readFileSync(manifest, "utf8"), cfg.key);
const result = await rotateDataKey(cfg.db, target, cfg.key, next, deletions);
const database = new DatabaseSync(target, { readOnly: true });
try {
  const rows = database
    .prepare(
      "SELECT order_id AS orderId,deleted_at AS deletedAt FROM deletion_tombstones",
    )
    .all() as Deletions;
  writeFileSync(target + ".deletions.json", encodeDeletions(rows, next), {
    flag: "wx",
    mode: 0o600,
  });
} finally {
  database.close();
}
console.log(
  "New offline database re-encrypted; fields:",
  result.encryptedFields,
  "All copied sessions revoked. Original DB/environment unchanged. No external upload. Keep old keys for old archives separately.",
);
