import { randomInt } from "node:crypto";
import { z } from "zod";
import { all, one, run, tx } from "./db";
import { audit, Fault, hash, id, limit, open, seal } from "./security";
import { enqueueMail, ownOrder, type Session } from "./service";
export function requestEmailChange(
  s: Session,
  orderId: string,
  rawEmail: unknown,
) {
  const order = ownOrder(s, orderId);
  if (
    order.payment_status !== "paid" ||
    order.content_deleted ||
    order.expires <= Date.now()
  )
    throw new Fault("열람 가능한 구매 주문만 이메일을 변경할 수 있습니다.");
  const proof = one(
    "SELECT verified_at FROM session_auth WHERE session_id=?",
    s.id,
  );
  if (
    !proof ||
    proof.verified_at > Date.now() ||
    proof.verified_at < Date.now() - 10 * 60000
  )
    throw new Fault("기존 구매 이메일을 다시 인증한 뒤 변경해 주세요.", 401);
  const email = z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .parse(rawEmail),
    newHash = hash(email);
  if (newHash === s.email_hash)
    throw new Fault("현재 구매 이메일과 다른 주소를 입력해 주세요.");
  limit("email-change-order:" + orderId, 3, 3600000);
  limit("email-change-destination:" + newHash, 5, 3600000);
  const changeId = id(),
    code = randomInt(0, 1000000).toString().padStart(6, "0");
  tx(() => {
    run(
      "UPDATE email_changes SET state='canceled' WHERE order_id=? AND state='pending'",
      orderId,
    );
    run(
      "INSERT INTO email_changes(id,order_id,old_hash,new_hash,new_email_enc,session_id,code_hash,expires) VALUES(?,?,?,?,?,?,?,?)",
      changeId,
      orderId,
      s.email_hash,
      newHash,
      seal(email),
      s.id,
      hash(changeId + code),
      Date.now() + 15 * 60000,
    );
    enqueueMail(newHash, {
      template: "email_change_otp",
      changeId,
      code,
      body: "구매 이메일 변경을 위한 로컬 시험 인증번호입니다. 실제 발송되지 않습니다.",
    });
    audit(s.id, "email_change_requested", orderId);
  });
  return changeId;
}
export function localEmailChangeCode(s: Session, changeId: string) {
  const change = one(
    "SELECT * FROM email_changes WHERE id=? AND session_id=? AND old_hash=? AND state='pending' AND expires>?",
    changeId,
    s.id,
    s.email_hash,
    Date.now(),
  );
  if (!change) throw new Fault("변경 인증 요청을 찾을 수 없습니다.", 404);
  const mail = all(
    "SELECT payload FROM outbox WHERE email_hash=? ORDER BY created DESC",
    change.new_hash,
  )
    .map((m) => open(m.payload))
    .find((m) => m.changeId === changeId);
  return { code: mail?.code };
}
export function confirmEmailChange(s: Session, changeId: string, code: string) {
  limit("email-change-confirm:" + s.id, 15, 900000);
  const result = tx(() => {
    const c = one(
      "SELECT * FROM email_changes WHERE id=? AND session_id=? AND old_hash=?",
      changeId,
      s.id,
      s.email_hash,
    );
    if (
      !c ||
      c.state !== "pending" ||
      c.expires <= Date.now() ||
      c.attempts >= 5
    )
      return false;
    run("UPDATE email_changes SET attempts=attempts+1 WHERE id=?", changeId);
    if (c.code_hash !== hash(changeId + code)) return false;
    const order = ownOrder(s, c.order_id);
    if (
      order.payment_status !== "paid" ||
      order.content_deleted ||
      order.expires <= Date.now()
    )
      return false;
    if (
      one(
        "SELECT id FROM orders WHERE reading_id=? AND email_hash=? AND payment_status!='refunded' AND id!=?",
        order.reading_id,
        c.new_hash,
        order.id,
      )
    )
      return false;
    run(
      "UPDATE orders SET email_hash=?,email_enc=? WHERE id=?",
      c.new_hash,
      c.new_email_enc,
      order.id,
    );
    run(
      "UPDATE tickets SET email_hash=? WHERE order_id=? AND email_hash=?",
      c.new_hash,
      order.id,
      c.old_hash,
    );
    run(
      "UPDATE email_changes SET state='completed',new_email_enc=? WHERE id=?",
      seal(null),
      changeId,
    );
    run(
      "UPDATE email_changes SET state='canceled' WHERE order_id=? AND state='pending'",
      order.id,
    );
    run(
      "DELETE FROM sessions WHERE email_hash IN (?,?)",
      c.old_hash,
      c.new_hash,
    );
    enqueueMail(c.old_hash, {
      template: "email_changed",
      orderId: order.id,
      body: "구매 이메일 변경이 완료되었습니다. 요청하지 않았다면 구매·개인정보 요청 경로로 알려주세요.",
    });
    enqueueMail(c.new_hash, {
      template: "email_changed",
      orderId: order.id,
      body: "구매 이메일 변경이 완료되었습니다. 새 주소를 인증하여 같은 운명서를 확인하세요.",
    });
    audit(s.id, "email_changed_both_addresses_verified", order.id);
    return true;
  });
  if (!result)
    throw new Fault(
      "변경 인증번호가 틀렸거나 만료되었습니다. 기존 이메일로 다시 인증해 주세요.",
    );
}
