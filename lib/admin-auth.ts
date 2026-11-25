import { checkAdminPassword } from "./admin-password";
import { z } from "zod";
import { newAdminToken } from "./admin-token";
import { one, run, tx } from "./db";
import { audit, Fault, hash, limit } from "./security";
import type { Session } from "./service";

/** Password-only operator login; offline owner recovery stays on the server. */
export function loginAdmin(s: Session, password: unknown, _rawCode?: unknown) {
  limit("admin-login-global", 15, 900000);
  limit("admin-login:" + s.id, 5, 900000);
  const pass = z.string().max(200).parse(password);
  const now = Date.now();
  if (!checkAdminPassword(pass)) {
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
    audit(sid, "admin_password_login_rotated", "local-operator");
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
