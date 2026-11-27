"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorBox, Loading } from "./client";
import ReportUnsealing from "./ReportUnsealing";
import PaymentReceipt from "./PaymentReceipt";
import { customerOrderState } from "../lib/customer-order-state";
export default function PaymentStatus({ id }: { id: string }) {
  const [o, setO] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let shouldPoll = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await api("orders/" + id);
        if (active) {
          const state = customerOrderState(r);
          shouldPoll = !state.terminal && !state.canRead;
          setO(r);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active && shouldPoll) timer = setTimeout(load, 1000);
      }
    }
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);
  if (error)
    return (
      <>
        <ErrorBox error={error} />
        <Link href="/recover" className="button secondary">
          이메일로 주문 다시 찾기
        </Link>
      </>
    );
  if (!o || o.id !== id) return <Loading />;
  const view = customerOrderState(o);
  const ready = view.canRead;
  if (view.state === "working" || ready)
    return (
      <ReportUnsealing id={id} ready={ready}>
        {ready && o.livePayment && <PaymentReceipt key={id} id={id} />}
      </ReportUnsealing>
    );
  return (
    <section className="payment-status-screen">
      <img
        className="payment-portrait"
        src="/empress-avatar-v2.webp"
        width="144"
        height="180"
        alt="금서태후"
      />
      <span className="status">{view.label}</span>
      <h1>{view.heading}</h1>
      <div className="card gold">
        <p className="quote">{view.description}</p>
        <dl className="data-list">
          <div>
            <dt>주문</dt>
            <dd>{o.id}</dd>
          </div>
          <div>
            <dt>결제 상태</dt>
            <dd>{o.payment}</dd>
          </div>
          <div>
            <dt>운명서 상태</dt>
            <dd>{view.label}</dd>
          </div>
        </dl>
        {ready ? (
          <Link className="button" href={"/report/" + id}>
            운명서 전체 읽기 ↗
          </Link>
        ) : (
          <p className="notice">
            {view.terminal
              ? "이 주문의 이용은 종료됐습니다. 기록 확인이나 이의가 있으면 아래 문의 경로를 이용해주세요."
              : "추가 결제 없이 저장된 주문 상태를 확인하고 있습니다. 오래 지연되면 아래 문의 경로를 이용해주세요."}
          </p>
        )}
      </div>
      <div className="actions">
        {o.livePayment &&
          ["paid", "refund_pending", "refunded"].includes(o.payment) && (
            <PaymentReceipt key={id} id={id} />
          )}
        {view.terminal && (
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            주문 상태 다시 확인
          </button>
        )}
        <Link className="button secondary" href="/recover">
          내 운명서 다시 찾기
        </Link>
      </div>
    </section>
  );
}
