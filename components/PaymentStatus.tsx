"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorBox, Loading } from "./client";
export default function PaymentStatus({ id }: { id: string }) {
  const [o, setO] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await api("orders/" + id);
        if (active) {
          setO(r);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    load();
    const timer = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(timer);
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
  if (!o) return <Loading />;
  const ready = !o.deleted && o.payment === "paid" && o.fulfillment === "ready";
  return (
    <>
      <img
        className="payment-portrait"
        src="/empress-avatar-v2.webp"
        width="144"
        height="180"
        alt="금서태후"
      />
      <span className="status">
        {o.payment === "paid" ? "모의 결제 확인 완료" : "주문 상태 확인"}
      </span>
      <h1>
        {ready
          ? "그대의 운명서가\n열렸느니라."
          : "결제와 작성 상태를\n확인하고 있습니다."}
      </h1>
      <div className="card gold">
        <p className="quote">
          {ready
            ? "그대의 이야기를 천천히 펼쳐보거라."
            : o.deleted
              ? "고객 요청 또는 보관기간 종료에 따라 운명서 원문이 삭제되었습니다."
              : o.fulfillment === "failed"
                ? "작성에 실패했습니다. 결제 사실은 보관되어 있으며 복구 또는 환불을 신청할 수 있습니다."
                : "창을 닫아도 서버의 작성 작업은 계속됩니다."}
        </p>
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
            <dd>{o.fulfillment}</dd>
          </div>
        </dl>
        {ready ? (
          <Link className="button" href={"/report/" + id}>
            운명서 전체 읽기 ↗
          </Link>
        ) : (
          <p className="notice">
            검증판은 별도 터미널에서 <code>npm run worker</code>가 실행 중이어야
            작성됩니다. 지연 시 고객센터에서 복구·환불을 요청하세요.
          </p>
        )}
      </div>
      <div className="actions">
        <Link className="button secondary" href="/recover">
          내 운명서 다시 찾기
        </Link>
        <Link className="button secondary" href="/help">
          복구·환불 문의
        </Link>
      </div>
    </>
  );
}
