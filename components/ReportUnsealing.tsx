"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
export default function ReportUnsealing({
  id,
  ready,
  children,
  preview = false,
}: {
  id: string;
  ready: boolean;
  children?: ReactNode;
  preview?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ready && !dialog.current?.open) dialog.current?.showModal();
  }, [ready]);
  return (
    <section className="report-unsealing" aria-label="운명서 펼치기">
      <svg
        className={ready ? "unsealing-mark complete" : "unsealing-mark"}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="unsealing-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f2dfaa" />
            <stop offset="48%" stopColor="#d0aa60" />
            <stop offset="100%" stopColor="#a8782f" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="#050505"
          stroke="#caa35b"
          strokeWidth="1"
        />
        <path
          d="M20 100a80 80 0 0 1 160 0a40 40 0 0 1-80 0a40 40 0 0 0-80 0"
          fill="url(#unsealing-gold)"
        />
        <circle
          cx="100"
          cy="100"
          r="94"
          className="unsealing-rim"
          fill="none"
          stroke="#ddbd7a"
          strokeWidth="1.2"
        />
      </svg>
      <h1 aria-live="polite">
        {ready ? "그대의 금서가 준비되었느니라" : "운명서 펼치는 중…"}
      </h1>
      <p>
        {ready
          ? "이제 그대의 이야기를 만나 보거라."
          : "그대의 기운을 한 장씩 금서에 담고 있느니라."}
      </p>
      {!ready && !preview && (
        <p className="unsealing-recovery">
          창을 닫아도 작성은 계속되느니라.
          <br />
          다시 올 때에는 <Link href="/recover">내 운명서 찾기</Link>를
          이용하거라.
        </p>
      )}
      {ready && (
        <button
          className="button secondary"
          onClick={() => dialog.current?.showModal()}
        >
          운명서 펼치기
        </button>
      )}
      {ready && (
        <div className="unsealing-order-links">
          {children}
          <Link href="/recover">내 운명서 찾기</Link>
        </div>
      )}
      <dialog
        ref={dialog}
        className="unsealing-dialog"
        aria-labelledby="unsealed-title"
      >
        <p className="eyebrow">금서태후의 전갈</p>
        <h2 id="unsealed-title">운명서가 펼쳐졌느니라.</h2>
        <p>그대의 이야기를 확인해 보겠느냐?</p>
        <Link className="button" href={"/report/" + id}>
          운명서 전체 읽기 ↗
        </Link>
        <button
          className="unsealing-later"
          onClick={() => dialog.current?.close()}
        >
          잠시 후에 보겠노라
        </button>
      </dialog>
    </section>
  );
}
