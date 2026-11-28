"use client";
import { useEffect, useState } from "react";
import { api, ApiError, EmailAuth, ErrorBox, Loading } from "./client";
import { customerOrderState } from "../lib/customer-order-state";
import SupportGuide from "./SupportGuide";
const categoryLabels: Record<string, string> = {
  refund: "환불 문의",
  correction: "출생정보 정정",
  email: "이메일 문의",
  privacy: "개인정보 요청",
  guardian: "법정대리인 요청",
  other: "기타 문의",
};
export default function Help() {
  const [verified, setVerified] = useState(false),
    [orders, setOrders] = useState<any[]>([]),
    [tickets, setTickets] = useState<any[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [o, t] = await Promise.all([api("orders"), api("tickets")]);
      setOrders(o);
      setTickets(t);
      setVerified(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setVerified(false);
        setOrders([]);
        setTickets([]);
      } else {
        setLoadError(
          "주문·문의 내역을 불러오지 못했습니다. 다시 접수하지 말고 내역을 다시 확인해주세요.",
        );
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
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
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : loadError ? (
        <div className="card">
          <ErrorBox error={loadError} />
          <button className="button secondary" onClick={load}>
            주문·문의 내역 다시 확인
          </button>
        </div>
      ) : !verified ? (
        <EmailAuth onVerified={load} />
      ) : (
        <>
          <form className="card" onSubmit={submit}>
            <h2>구매·환불·개인정보 요청</h2>
            <p className="hint">
              환불은 사유와 법적 요건을 확인해 처리합니다. 카드번호·신분증 원본
              등은 입력하지 마세요.
            </p>
            <div className="field">
              <label htmlFor="help-order">관련 주문</label>
              <select id="help-order" name="orderId">
                <option value="">주문 없음 / 일반 문의</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id.slice(0, 8)} · {customerOrderState(o).label}
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
              <span className="status">
                {t.answer ? "답변 완료" : "접수 완료"}
              </span>
              <p className="hint">
                접수번호 {t.id} · {categoryLabels[t.category] ?? "문의"}
                <br />
                처리 검토 기준일{" "}
                {new Date(t.due).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                · 법정기한은 사안별 별도 검토
              </p>
              <p>{t.message}</p>
              {t.answer && <div className="notice">답변: {t.answer}</div>}
            </article>
          ))}
        </>
      )}
    </>
  );
}
