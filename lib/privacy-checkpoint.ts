/** Local signed deletion checkpoints. Offsite freshness still requires an authoritative copy. */
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  lstatSync,
  realpathSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  encodeDeletions,
  collectDeletions,
  deletionIdentity,
  decodeDeletions,
  type Deletions,
} from "./deletion-manifest";

export function privacyCheckpointDirectory(databasePath: string, key: Buffer) {
  const generation = createHmac("sha256", key)
    .update("gumseo-checkpoint-directory-v1:" + resolve(databasePath))
    .digest("hex")
    .slice(0, 16);
  return join(dirname(databasePath), "privacy-checkpoints-" + generation);
}

const maxBytes = 16 * 1024 * 1024;
const schema = z
  .object({
    version: z.literal(1),
    sourceId: z.string().uuid(),
    generatedAt: z.number().int().nonnegative(),
    manifestFile: z.string().regex(/^deletions-[a-f0-9-]{36}\.json$/),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    count: z.number().int().min(0).max(100000),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Receipt = z.infer<typeof schema>;
function mac(row: Omit<Receipt, "signature">, key: Buffer) {
  if (key.length !== 32) throw Error("CHECKPOINT_KEY_REQUIRED");
  return createHmac("sha256", key)
    .update(
      "gumseo-privacy-checkpoint-v1:" +
        JSON.stringify([
          row.version,
          row.sourceId,
          row.generatedAt,
          row.manifestFile,
          row.manifestSha256,
          row.count,
        ]),
    )
    .digest("hex");
}
function regular(file: string, max: number) {
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > max)
    throw Error("UNSAFE_CHECKPOINT_FILE");
}
function privateDirectory(directory: string, create = false) {
  const dir = resolve(directory);
  if (create) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (
    !lstatSync(dir).isDirectory() ||
    lstatSync(dir).isSymbolicLink() ||
    realpathSync(dir) !== dir
  )
    throw Error("UNSAFE_CHECKPOINT_DIRECTORY");
  if (create) chmodSync(dir, 0o700);
  return dir;
}
export function readPrivacyCheckpoint(
  file: string,
  key: Buffer,
  now = Date.now(),
  maxAgeMs = 24 * 3600000,
) {
  const dir = privateDirectory(dirname(resolve(file)));
  regular(file, 4096);
  const row = schema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (
    !timingSafeEqual(
      Buffer.from(row.signature, "hex"),
      Buffer.from(mac(row, key), "hex"),
    )
  )
    throw Error("CHECKPOINT_AUTHENTICATION_FAILED");
  if (row.generatedAt > now + 30000 || now - row.generatedAt > maxAgeMs)
    throw Error("CHECKPOINT_STALE_OR_FUTURE");
  const manifest = join(dir, row.manifestFile);
  regular(manifest, maxBytes);
  const text = readFileSync(manifest, "utf8");
  if (createHash("sha256").update(text).digest("hex") !== row.manifestSha256)
    throw Error("CHECKPOINT_MANIFEST_MISMATCH");
  const rows = decodeDeletions(text, key);
  if (
    rows.length !== row.count ||
    new Set(rows.map(deletionIdentity)).size !== rows.length ||
    rows.some((r) => r.deletedAt > row.generatedAt)
  )
    throw Error("CHECKPOINT_CONTENT_MISMATCH");
  return { ...row, rows };
}
function durableWrite(file: string, text: string) {
  writeFileSync(file, text, { flag: "wx", mode: 0o600 });
  const fd = openSync(file, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function publishPrivacyCheckpoint(
  database: DatabaseSync,
  directory: string,
  key: Buffer,
  now = Date.now(),
) {
  const dir = privateDirectory(directory, true),
    latest = join(dir, "latest.json");
  let temp: string | undefined;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(
      "CREATE TABLE IF NOT EXISTS privacy_checkpoint_source(id INTEGER PRIMARY KEY CHECK(id=1),source_id TEXT NOT NULL)",
    );
    database
      .prepare("INSERT OR IGNORE INTO privacy_checkpoint_source VALUES(1,?)")
      .run(randomUUID());
    const sourceId = z
      .string()
      .uuid()
      .parse(
        database
          .prepare("SELECT source_id FROM privacy_checkpoint_source WHERE id=1")
          .get()!.source_id,
      );
    const rows = collectDeletions(database);
    if (rows.some((r) => r.deletedAt > now))
      throw Error("INVALID_DELETION_TIME");
    const text = encodeDeletions(rows, key);
    if (Buffer.byteLength(text) > maxBytes) throw Error("CHECKPOINT_TOO_LARGE");
    const digest = createHash("sha256").update(text).digest("hex");
    let previous: ReturnType<typeof readPrivacyCheckpoint> | undefined;
    if (lstatSync(latest, { throwIfNoEntry: false }))
      previous = readPrivacyCheckpoint(
        latest,
        key,
        now,
        Number.POSITIVE_INFINITY,
      );
    if (previous && previous.sourceId !== sourceId)
      throw Error("CHECKPOINT_SOURCE_MISMATCH");
    if (
      previous?.sourceId === sourceId &&
      previous.manifestSha256 === digest &&
      now - previous.generatedAt < 5 * 60000
    ) {
      healthTable(database);
      database
        .prepare(
          "INSERT INTO privacy_checkpoint_health VALUES(1,?,NULL) ON CONFLICT(id) DO UPDATE SET generated_at=excluded.generated_at,last_failure=NULL",
        )
        .run(previous.generatedAt);
      database.exec("COMMIT");
      return { changed: false, path: latest, count: rows.length };
    }
    const manifestFile =
      previous?.sourceId === sourceId && previous.manifestSha256 === digest
        ? previous.manifestFile
        : "deletions-" + randomUUID() + ".json";
    if (manifestFile !== previous?.manifestFile)
      durableWrite(join(dir, manifestFile), text);
    const body = {
      version: 1 as const,
      sourceId,
      generatedAt: now,
      manifestFile,
      manifestSha256: digest,
      count: rows.length,
    };
    temp = join(dir, ".checkpoint-" + randomUUID() + ".tmp");
    durableWrite(temp, JSON.stringify({ ...body, signature: mac(body, key) }));
    renameSync(temp, latest);
    temp = undefined;
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    healthTable(database);
    database
      .prepare(
        "INSERT INTO privacy_checkpoint_health VALUES(1,?,NULL) ON CONFLICT(id) DO UPDATE SET generated_at=excluded.generated_at,last_failure=NULL",
      )
      .run(now);
    database.exec("COMMIT");
    return { changed: true, path: latest, count: rows.length };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    if (temp) rmSync(temp, { force: true });
  }
}

function healthTable(database: DatabaseSync) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS privacy_checkpoint_health(id INTEGER PRIMARY KEY CHECK(id=1),generated_at INTEGER NOT NULL,last_failure INTEGER)",
  );
}
export function recordPrivacyCheckpointFailure(
  database: DatabaseSync,
  now = Date.now(),
) {
  healthTable(database);
  database
    .prepare(
      "INSERT INTO privacy_checkpoint_health VALUES(1,0,?) ON CONFLICT(id) DO UPDATE SET last_failure=excluded.last_failure",
    )
    .run(now);
}
export function privacyCheckpointHealth(
  database: DatabaseSync,
  now = Date.now(),
) {
  const has = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='privacy_checkpoint_health'",
    )
    .get();
  const row = has
    ? database
        .prepare(
          "SELECT generated_at,last_failure FROM privacy_checkpoint_health WHERE id=1",
        )
        .get()
    : undefined;
  const generated = row ? Number(row.generated_at) : 0;
  return {
    healthy:
      !!row &&
      !row.last_failure &&
      generated <= now &&
      now - generated < 10 * 60000,
    generatedAt: generated || null,
    failed: !!row?.last_failure,
  };
}
