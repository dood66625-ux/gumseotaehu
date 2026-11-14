import { readFileSync, statSync } from "node:fs";
export function readPrivateKey(path: string) {
  const stat = statSync(path);
  if ((stat.mode & 0o077) !== 0 || stat.size > 128)
    throw Error("PRIVATE_KEY_FILE_REQUIRED");
  const hex = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(hex)) throw Error("INVALID_DATA_KEY_FILE");
  return Buffer.from(hex, "hex");
}
