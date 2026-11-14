import { z } from "zod";
import { one } from "./db";
import { hash } from "./security";
export const mailProfileSchema = z.object({
  sender: z.string().email().max(254),
  replyTo: z.string().email().max(254),
  origin: z.string(),
});
export type MailProfile = z.infer<typeof mailProfileSchema>;
export type MailEnvelope = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
};
const templates = [
  "otp",
  "email_change_otp",
  "payment_confirmed",
  "report_ready",
  "report_link",
  "generation_failed",
  "refund_completed",
  "support_answered",
  "email_changed",
] as const;
export const mailPayload = z.object({
  template: z.enum(templates),
  challengeId: z.string().uuid().optional(),
  changeId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type MailPayload = z.infer<typeof mailPayload>;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Recheck authorization and expiry before dispatch; outbox text is never trusted as HTML. */
export function mailDeadline(
  p: MailPayload,
  emailHash: string,
  created: number,
): number | null {
  const now = Date.now();
  if (p.template === "otp") {
    const c = p.challengeId
      ? one("SELECT * FROM challenges WHERE id=?", p.challengeId)
      : null;
    return c &&
      !c.consumed &&
      c.expires > now &&
      c.email_hash === emailHash &&
      p.code &&
      c.code_hash === hash(p.challengeId! + p.code)
      ? c.expires
      : null;
  }
  if (p.template === "email_change_otp") {
    const c = p.changeId
      ? one("SELECT * FROM email_changes WHERE id=?", p.changeId)
      : null;
    return c &&
      c.state === "pending" &&
      c.expires > now &&
      c.new_hash === emailHash &&
      p.code &&
      c.code_hash === hash(p.changeId! + p.code)
      ? c.expires
      : null;
  }
  if (p.template === "support_answered") {
    const t = p.ticketId
      ? one("SELECT email_hash,status FROM tickets WHERE id=?", p.ticketId)
      : null;
    return t && t.status === "answered" && t.email_hash === emailHash
      ? created + 7 * 86400000
      : null;
  }
  if (p.template === "email_changed") {
    const c = p.orderId
      ? one(
          "SELECT id FROM email_changes WHERE order_id=? AND state='completed' AND (old_hash=? OR new_hash=?)",
          p.orderId,
          emailHash,
          emailHash,
        )
      : null;
    return c ? created + 86400000 : null;
  }
  const o = p.orderId
    ? one("SELECT * FROM orders WHERE id=?", p.orderId)
    : null;
  if (!o || o.email_hash !== emailHash) return null;
  if (p.template === "refund_completed")
    return o.payment_status === "refunded" ? created + 7 * 86400000 : null;
  if (o.payment_status !== "paid" || o.content_deleted || o.expires <= now)
    return null;
  if (p.template === "report_ready" && o.fulfillment !== "ready") return null;
  if (p.template === "generation_failed" && o.fulfillment !== "failed")
    return null;
  return Math.min(o.expires, created + 7 * 86400000);
}
export function renderMail(
  p: MailPayload,
  to: string,
  profile: MailProfile,
  deadline: number,
): MailEnvelope {
  const code = p.code ?? "",
    link =
      profile.origin +
      (p.template === "support_answered" ? "/help" : "/recover");
  const expiry = new Date(deadline).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
  const copy: Record<MailPayload["template"], [string, string]> = {
    otp: [
      "이메일 인증번호 안내",
      `인증번호는 ${code}입니다. ${expiry}까지 사용할 수 있습니다. 새 인증번호를 요청하면 이전 번호는 사용할 수 없습니다. 요청하지 않았다면 무시해 주세요.`,
    ],
    email_change_otp: [
      "구매 이메일 변경 인증번호",
      `변경 인증번호는 ${code}입니다. ${expiry}까지 사용할 수 있습니다. 기존 구매 이메일의 인증과 새 주소 확인이 모두 완료되어야 변경됩니다. 요청하지 않았다면 이 번호를 공유하지 마세요.`,
    ],
    payment_confirmed: [
      "결제 확인 안내",
      "33,000원 일회성 결제가 확인되었습니다. 운명서 작성 상태를 이메일 인증 후 확인할 수 있습니다.",
    ],
    report_ready: [
      "운명서가 준비되었습니다",
      "이메일 인증으로 구매한 운명서를 확인하고 PDF로 저장할 수 있습니다. 화면을 닫았더라도 추가 결제 없이 다시 찾을 수 있습니다.",
    ],
    report_link: [
      "구매 운명서 다시 찾기",
      "아래 주소에서 구매 이메일을 인증해 같은 운명서와 제공 상태를 확인하세요. 비밀번호나 인증번호를 다른 사람에게 공유하지 마세요.",
    ],
    generation_failed: [
      "운명서 제공 상태 확인 안내",
      "결제는 확인되었으나 운명서 작성이 완료되지 않았습니다. 추가 결제 없이 같은 주문에서 복구 또는 환불 검토를 요청할 수 있습니다.",
    ],
    refund_completed: [
      "전액 취소 확인 안내",
      "결제 전액 취소가 확인되었습니다. 실제 환급 반영 시점은 결제수단에 따라 다를 수 있습니다. 주문 확인이나 필요한 요청은 이메일 인증 후 이용해 주세요.",
    ],
    support_answered: [
      "구매 요청 답변 안내",
      "접수한 요청에 답변이 등록되었습니다. 개인정보 보호를 위해 답변 원문은 이메일에 넣지 않았습니다. 이메일 인증 후 확인해 주세요.",
    ],
    email_changed: [
      "구매 이메일 변경 안내",
      "구매 이메일 변경이 완료되었습니다. 새 주소를 인증하면 같은 운명서를 확인할 수 있습니다. 요청하지 않은 변경이라면 구매·개인정보 요청 경로로 알려주세요.",
    ],
  };
  const [subject, body] = copy[p.template];
  const tail =
    p.template === "otp" || p.template === "email_change_otp"
      ? ""
      : "\n\n인증 후 확인: " + link;
  const text = "금서태후\n\n" + body + tail;
  return {
    from: profile.sender,
    to,
    replyTo: profile.replyTo,
    subject: "[금서태후] " + subject,
    text,
    html: `<main lang="ko"><h1>금서태후</h1><p>${escape(body)}</p>${tail ? `<p><a href="${escape(link)}">이메일 인증 후 확인</a></p>` : ""}</main>`,
  };
}
