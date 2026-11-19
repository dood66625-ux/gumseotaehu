/** Immutable signed live payment enrollment; creation never dispatches a payment. */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  constants,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
const bindingSchema = z
  .object({
    sourceId: z.string().uuid(),
    profileDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const bodySchema = bindingSchema
  .extend({
    version: z.literal(1),
    createdAtOrAfter: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const recordSchema = bodySchema
  .extend({ signature: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
type Binding = z.infer<typeof bindingSchema>;
function signature(body: z.infer<typeof bodySchema>, key: Buffer) {
  if (key.length !== 32) throw Error("TOSS_CUTOVER_KEY_REQUIRED");
  return createHmac("sha256", key)
    .update(
      "gumseo-toss-cutover-v1:" +
        JSON.stringify([
          body.version,
          body.sourceId,
          body.profileDigest,
          body.createdAtOrAfter,
        ]),
    )
    .digest();
}
function privateParent(file: string) {
  const path = resolve(file),
    parent = dirname(path),
    stat = lstatSync(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(parent) !== parent ||
    (stat.mode & 0o077) !== 0
  )
    throw Error("TOSS_CUTOVER_PRIVATE_DIRECTORY_REQUIRED");
  return path;
}
export function createTossCutoverFile(
  file: string,
  binding: Binding,
  key: Buffer,
  now = Date.now(),
) {
  if (!Number.isSafeInteger(now) || now < 0)
    throw Error("INVALID_TOSS_CUTOVER_TIME");
  const body = bodySchema.parse({
    version: 1,
    ...bindingSchema.parse(binding),
    createdAtOrAfter: now + 1,
  });
  const record = { ...body, signature: signature(body, key).toString("hex") };
  const path = privateParent(file);
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, JSON.stringify(record) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const directory = openSync(
    dirname(path),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  return {
    createdAtOrAfter: body.createdAtOrAfter,
    paymentsEnabledByCreation: false as const,
  };
}
export function readTossCutoverFile(
  file: string,
  expected: Binding,
  key: Buffer,
  now = Date.now(),
) {
  const binding = bindingSchema.parse(expected),
    path = privateParent(file);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text: string;
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 4096
    )
      throw Error("INVALID_TOSS_CUTOVER_FILE");
    text = readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
  const { signature: mac, ...body } = recordSchema.parse(JSON.parse(text));
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    body.createdAtOrAfter > now ||
    body.sourceId !== binding.sourceId ||
    body.profileDigest !== binding.profileDigest ||
    !timingSafeEqual(Buffer.from(mac, "hex"), signature(body, key))
  )
    throw Error("TOSS_CUTOVER_MISMATCH");
  return { createdAtOrAfter: body.createdAtOrAfter };
}
