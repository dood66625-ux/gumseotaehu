"use client";
import EmailChange from "./EmailChange";
import { customerOrderState } from "../lib/customer-order-state";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, EmailAuth, ErrorBox, Loading } from "./client";
export default function Recover() {
  const [verified, setVerified] = useState(false),
    [orders, setOrders] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!verified) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [verified]);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setOrders(await api("orders"));
      setNow(Date.now());
      setVerified(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setVerified(false);
        setOrders([]);
      } else {
        setError(
          "구매 내역을 불러오지 못했습니다. 추가 결제 없이 다시 확인해주세요.",
        );
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="card">
        <ErrorBox error={error} />
        <button className="button secondary" onClick={load}>
          구매 내역 다시 확인
        </button>
      </div>
    );
  return (
    <>
      {!verified ? (
        <EmailAuth onVerified={load} />
      ) : (
        <>
          <p className="success">
            이메일 인증 완료 · 주문별 결제 상태와 열람기한을 확인하세요.
          </p>
          <ErrorBox error={error} />
          {!orders.length && (
            <div className="card">
              이 이메일의 구매 내역이 없습니다. 결제한 주소가 다른지 확인하세요.
            </div>
          )}
          {orders.map((o) => {
            const view = customerOrderState(o, now);
            return (
              <article className="card" key={o.id}>
                <span className="status">{view.label}</span>
                <h2>금서태후 종합 운명서</h2>
                <p className="hint">{view.description}</p>
                <p className="hint">
                  주문 {o.id}
                  <br />
                  {new Date(o.created).toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}{" "}
                  · {o.amount.toLocaleString()}원
                  {o.livePayment ? "" : " (모의)"}
                  <br />
                  {o.expires
                    ? (view.terminal ? "기록된 열람기한 " : "열람기한 ") +
                      new Date(o.expires).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })
                    : "열람기한 정보가 없습니다. 주문 상태를 확인해주세요."}
                </p>
                <div className="actions">
                  {view.canRead ? (
                    <Link href={"/report/" + o.id} className="button">
                      같은 운명서 다시 읽기
                    </Link>
                  ) : (
                    <Link
                      href={"/checkout/success?orderId=" + o.id}
                      className="button secondary"
                    >
                      주문 상태 보기
                    </Link>
                  )}
                </div>
                {view.canChangeEmail && <EmailChange orderId={o.id} />}
              </article>
            );
          })}
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("logout", {});
                setVerified(false);
                setOrders([]);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            인증 종료 · 다른 이메일로 찾기
          </button>
        </>
      )}
    </>
  );
}
