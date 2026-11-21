import { createHash } from "node:crypto";
import { z } from "zod";
import { newAdminToken } from "./admin-token";
import { one, run, tx } from "./db";
import { audit, equal, Fault, hash, limit, totp } from "./security";
import type { Session } from "./service";

/** Single self-hosted operator; host-owner recovery stays offline, never a public MFA bypass. */
export function loginAdmin(s: Session, password: unknown, rawCode: unknown) {
  limit("admin-login-global", 15, 900000);
  limit("admin-login:" + s.id, 5, 900000);
  const pass = z.string().max(200).parse(password),
    code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(rawCode);
  const secret = process.env.ADMIN_TOTP_SECRET!;
  const now = Date.now(),
    step = Math.floor(now / 30000);
  const matched = [step, step - 1, step + 1].find((n) =>
    equal(code, totp(secret, n * 30000)),
  );
  if (!equal(pass, process.env.ADMIN_PASSWORD!) || matched === undefined) {
    audit(s.id, "admin_login_failed", "local-operator");
    throw new Fault("관리자 인증에 실패했습니다.", 401);
  }
  return tx(() => {
    const current = one(
      "SELECT * FROM sessions WHERE id=? AND expires>?",
      s.id,
      now,
    );
    if (!current) throw new Fault("세션이 만료되었습니다.", 401);
    const operator = createHash("sha256").update(secret).digest("hex");
    const consumed = one(
      "INSERT INTO admin_totp_replay VALUES(?,?) ON CONFLICT(operator_key) DO UPDATE SET last_step=excluded.last_step WHERE last_step<excluded.last_step RETURNING last_step",
      operator,
      matched,
    );
    if (!consumed)
      throw new Fault(
        "사용된 관리자 인증코드입니다. 다음 코드를 입력해 주세요.",
        401,
      );
    const token = newAdminToken(),
      sid = hash(token);
    run(
      "INSERT INTO sessions VALUES(?,?,?,?,?)",
      sid,
      current.email_hash,
      "operations",
      now + 1800000,
      now,
    );
    run("UPDATE readings SET session_id=? WHERE session_id=?", sid, s.id);
    run("UPDATE challenges SET session_id=? WHERE session_id=?", sid, s.id);
    run("UPDATE session_auth SET session_id=? WHERE session_id=?", sid, s.id);
    run("DELETE FROM sessions WHERE id=?", s.id);
    run("INSERT INTO admin_auth VALUES(?,?)", sid, now);
    audit(sid, "admin_mfa_login_rotated", "local-operator");
    return token;
  });
}
export function requireRecentAdmin(
  s: Session,
  roles = ["operations", "finance"],
) {
  const current = one(
    "SELECT s.role,s.expires,a.verified_at FROM sessions s LEFT JOIN admin_auth a ON a.session_id=s.id WHERE s.id=?",
    s.id,
  );
  const now = Date.now();
  if (!current || !roles.includes(current.role) || current.expires <= now)
    throw new Fault("관리자 권한이 필요합니다.", 403);
  if (
    !current.verified_at ||
    current.verified_at > now ||
    now - current.verified_at > 10 * 60000
  )
    throw new Fault("중요 작업 전 관리자 로그인을 다시 해주세요.", 401);
}
export function revokeAdminSessions(s: Session) {
  requireRecentAdmin(s, ["operations"]);
  tx(() => {
    run("DELETE FROM sessions WHERE role!='customer'");
    audit(s.id, "admin_sessions_revoked", "all-operators");
  });
}
