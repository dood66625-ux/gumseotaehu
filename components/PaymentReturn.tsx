"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ErrorBox } from "./client";
import PaymentStatus from "./PaymentStatus";
export default function PaymentReturn({
  id,
  paymentKey,
  amount,
}: {
  id: string;
  paymentKey?: string;
  amount?: string;
}) {
  const [error, setError] = useState(""),
    [checking, setChecking] = useState(!!paymentKey || amount !== undefined);
  const started = useRef(false),
    pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        id,
      ) ||
      !paymentKey ||
      paymentKey.length > 200 ||
      /[\x00-\x1f\x7f]/.test(paymentKey) ||
      !amount ||
      !/^[1-9][0-9]{0,6}$/.test(amount)
    ) {
      setChecking(false);
      setError(
        "결제 복귀 정보를 확인하지 못했습니다. 추가 결제 전에 주문 상태를 확인해 주세요.",
      );
      return;
    }
    pending.current = true;
    setChecking(true);
    setError("");
    try {
      await api("payments/live-return", {
        orderId: id,
        paymentKey,
        amount: Number(amount),
      });
      // Only remove callback fields after a server acknowledgement. A network failure may precede persistence.
      const address = new URL(location.href);
      address.searchParams.delete("paymentKey");
      address.searchParams.delete("amount");
      history.replaceState(null, "", address.pathname + address.search);
    } catch {
      setError(
        "결제 상태를 확인 중입니다. 추가 결제 없이 같은 주문으로 다시 확인해 주세요.",
      );
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      if (paymentKey || amount !== undefined) void confirm();
    }
  }, []);
  if (checking)
    return (
      <div className="card" role="status">
        결제 내역을 확인하고 있습니다. 잠시 기다려 주세요.
      </div>
    );
  return (
    <>
      {error && (
        <div className="card">
          <ErrorBox error={error} />
          <button className="button secondary" onClick={confirm}>
            같은 주문 다시 확인
          </button>
          <Link href="/recover">이메일로 주문 찾기</Link>
        </div>
      )}
      <PaymentStatus id={id} />
    </>
  );
}
