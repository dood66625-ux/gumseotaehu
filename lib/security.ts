import { encryptJson, decryptJson } from "./crypto";
import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import { config } from "./config";
import { one, run, tx } from "./db";
export const id = () => randomUUID();
export const hash = (v: string) =>
  createHmac("sha256", config().secret).update(v).digest("hex");
export function seal(v: unknown) {
  return encryptJson(v, config().key);
}
export function open<T = any>(s: string): T {
  return decryptJson<T>(s, config().key);
}
export function equal(a: string, b: string) {
  const x = createHash("sha256").update(a).digest(),
    y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}
export function audit(actor: string, action: string, target: string) {
  run(
    "INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)",
    actor,
    action,
    target,
    Date.now(),
  );
}
export function event(e: string, target: string) {
  run(
    "INSERT OR IGNORE INTO events VALUES(?,?,?,?)",
    id(),
    e,
    target,
    Date.now(),
  );
}
export class Fault extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function limit(key: string, max: number, window = 3600000) {
  return tx(() => {
    const now = Date.now(),
      k = hash(key),
      r = one("SELECT * FROM rate_limits WHERE key=?", k);
    if (!r || r.reset < now) {
      run(
        "INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)",
        k,
        1,
        now + window,
      );
      return;
    }
    if (r.count >= max)
      throw new Fault("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    run("UPDATE rate_limits SET count=count+1 WHERE key=?", k);
  });
}
export function totp(secret: string, at = Date.now()) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const d = createHmac("sha1", Buffer.from(secret, "hex")).update(b).digest(),
    o = d[d.length - 1] & 15;
  return ((d.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function verifyTotp(code: string) {
  return [-30000, 0, 30000].some((x) =>
    equal(code, totp(process.env.ADMIN_TOTP_SECRET!, Date.now() + x)),
  );
}
