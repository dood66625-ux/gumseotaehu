import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { one, run, tx } from "./db";
import { equal } from "./security";
export function checkAdminPassword(password: string) {
  const row = one("SELECT digest FROM admin_credentials WHERE id=1");
  if (!row) return equal(password, process.env.ADMIN_PASSWORD!);
  const [salt, expected] = String(row.digest).split(":");
  const actual = scryptSync(password, salt, 64);
  const wanted = Buffer.from(expected, "hex");
  return wanted.length === actual.length && timingSafeEqual(actual, wanted);
}
export function setAdminPassword(password: string) {
  if (password.length < 12 || password.length > 200)
    throw Error("비밀번호는 12~200자로 설정해주세요.");
  const salt = randomBytes(24).toString("hex");
  tx(() => {
    run(
      "INSERT INTO admin_credentials VALUES(1,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest",
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
    );
    run("DELETE FROM sessions WHERE role!='customer'");
  });
}
