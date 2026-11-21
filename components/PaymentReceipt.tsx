"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "./client";
import { safeTossReceiptUrl } from "../lib/toss-receipt";
/** Parent keys this component by order. Late GET responses never attach to another order. */
export default function PaymentReceipt({ id }: { id: string }) {
  const active = useRef(false),
    pending = useRef(false);
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setUrl("");
    setError("");
    try {
      const result = await api("orders/" + id + "/receipt");
      if (!active.current) return;
      const safe = safeTossReceiptUrl(result.url);
      if (!safe) throw Error("INVALID_RECEIPT");
      setUrl(safe);
    } catch {
      if (active.current)
        setError(
          "구매 증빙을 불러오지 못했습니다. 잠시 후 다시 확인하거나 문의해 주세요.",
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <div>
      <button className="button secondary" disabled={busy} onClick={load}>
        {busy ? "구매 증빙 확인 중…" : "토스 구매 증빙 확인"}
      </button>
      {url && (
        <a
          className="button secondary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          토스 구매 증빙 열기 ↗
        </a>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
