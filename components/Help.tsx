"use client";
import { useEffect, useState } from "react";
import { api, EmailAuth, ErrorBox } from "./client";
import SupportGuide from "./SupportGuide";
export default function Help() {
  const [verified, setVerified] = useState(false),
    [orders, setOrders] = useState<any[]>([]),
    [tickets, setTickets] = useState<any[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [o, t] = await Promise.all([api("orders"), api("tickets")]);
      setOrders(o);
      setTickets(t);
      setVerified(true);
    } catch {
      setVerified(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      const r = await api("tickets", {
        orderId: f.get("orderId") || undefined,
        category: f.get("category"),
        message: f.get("message"),
      });
      setMessage("접수되었습니다. 문의번호 " + r.id);
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SupportGuide />
      {!verified ? (
        <EmailAuth onVerified={load} />
      ) : (
        <>
          <form className="card" onSubmit={submit}>
            <h2>구매·환불·개인정보 요청</h2>
            <p className="hint">
              환불은 사유와 법적 요건을 확인해 처리합니다. 카드번호·신분증 원본
              등은 입력하지 마세요. 현재는 체험판이며 실제 접수 채널은 운영 설정
              후 개통됩니다.
            </p>
            <div className="field">
              <label htmlFor="help-order">관련 주문</label>
              <select id="help-order" name="orderId">
                <option value="">주문 없음 / 일반 문의</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id.slice(0, 8)} · {o.payment} · {o.fulfillment}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="category">문의 종류</label>
              <select id="category" name="category">
                <option value="refund">
                  환불 · 이중결제 · 미제공 · 고객 변심
                </option>
                <option value="correction">출생정보 정정</option>
                <option value="email">이메일 변경·재발송·재열람</option>
                <option value="privacy">개인정보 열람·삭제</option>
                <option value="guardian">
                  법정대리인의 미성년자 계약 취소
                </option>
                <option value="other">그 밖의 구매·권리 요청</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="help-message">문의 내용</label>
              <textarea
                id="help-message"
                name="message"
                minLength={5}
                maxLength={2000}
                required
                placeholder="상황과 원하는 해결 방법을 알려주세요."
              />
            </div>
            <ErrorBox error={error} />
            {message && (
              <p className="success" role="status">
                {message}
              </p>
            )}
            <button className="button" disabled={busy}>
              문의 접수하기
            </button>
          </form>
          <h2>접수 내역</h2>
          {!tickets.length && (
            <p className="muted">아직 접수한 문의가 없습니다.</p>
          )}
          {tickets.map((t) => (
            <article className="card" key={t.id}>
              <span className="status">{t.status}</span>
              <p className="hint">
                {t.id} · {t.category}
                <br />
                처리 검토 기준일{" "}
                {new Date(t.due).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                · 법정기한은 사안별 별도 검토
              </p>
              <p>{t.message}</p>
              {t.answer && (
                <div className="notice">운영자 답변: {t.answer}</div>
              )}
            </article>
          ))}
        </>
      )}
    </>
  );
}
