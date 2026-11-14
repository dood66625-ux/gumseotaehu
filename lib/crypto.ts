import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function encryptJson(value: unknown, key: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decryptJson<T = unknown>(value: string, key: Buffer): T {
  const b = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString(
      "utf8",
    ),
  );
}
