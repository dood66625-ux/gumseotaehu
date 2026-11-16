"use client";
import EmailChange from "./EmailChange";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, EmailAuth, ErrorBox, Loading } from "./client";
export default function Recover() {
  const [verified, setVerified] = useState(false),
    [orders, setOrders] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setOrders(await api("orders"));
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
            이메일 인증 완료 · 추가 결제 없이 같은 운명서를 확인하세요.
          </p>
          <ErrorBox error={error} />
          {!orders.length && (
            <div className="card">
              이 이메일의 구매 내역이 없습니다. 결제한 주소가 다른지 확인하세요.
            </div>
          )}
          {orders.map((o) => (
            <article className="card" key={o.id}>
              <span className="status">
                {o.deleted ? "삭제 완료" : o.payment + " · " + o.fulfillment}
              </span>
              <h2>금서태후 종합 운명서</h2>
              <p className="hint">
                주문 {o.id}
                <br />
                {new Date(o.created).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                · {o.amount.toLocaleString()}원 (모의)
                <br />
                {o.expires
                  ? "열람기한 " +
                    new Date(o.expires).toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : "아직 결제가 확인되지 않았습니다."}
              </p>
              <div className="actions">
                {!o.deleted &&
                o.payment === "paid" &&
                o.fulfillment === "ready" ? (
                  <Link href={"/report/" + o.id} className="button">
                    같은 운명서 다시 읽기
                  </Link>
                ) : (
                  <Link
                    href={"/checkout/success?orderId=" + o.id}
                    className="button secondary"
                  >
                    주문·복구 상태 보기
                  </Link>
                )}
                <Link href="/help" className="button secondary">
                  문의·환불
                </Link>
              </div>
              {!o.deleted && o.payment === "paid" && (
                <EmailChange orderId={o.id} />
              )}
            </article>
          ))}
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
