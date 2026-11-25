"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, ErrorBox, Loading } from "./client";
import { visitStages } from "../lib/visit-stages";
import { reportBook } from "../lib/report-book";
const time = (n: number) =>
  new Date(n).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default function VisitorAdmin() {
  const [page, setPage] = useState(0),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<any>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0),
    reportGeneration = useRef(0);
  const label = (stage: string) =>
    visitStages[stage as keyof typeof visitStages] ?? stage;
  async function load() {
    reportGeneration.current++;
    setBusy(false);
    setDetail(null);
    dialog.current?.close();
    const version = ++generation.current;
    setData(null);
    setError("");
    try {
      const next = await api("admin/visitors?page=" + page);
      if (version === generation.current) setData(next);
    } catch (e) {
      if (version === generation.current) {
        setDetail(null);
        dialog.current?.close();
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    load();
    return () => {
      generation.current++;
      reportGeneration.current++;
    };
  }, [page]);
  async function show(id: string) {
    const version = ++reportGeneration.current;
    setBusy(true);
    setDetail(null);
    setError("");
    try {
      const next = await api("admin/visitor-report/" + id);
      if (version !== reportGeneration.current) return;
      setDetail(next);
      dialog.current?.showModal();
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status)) setData(null);
      setError((e as Error).message);
    } finally {
      if (version === reportGeneration.current) setBusy(false);
    }
  }
  const book = detail ? reportBook(detail.report) : null;
  return (
    <div className="page">
      <p>
        <a href="/admin">← 운영자 인증·운영 현황</a>
      </p>
      <h1>방문·구매 전환 기록</h1>
      <p className="hint">
        최근 30일의 방문 세션입니다. 유입 사이트는 출발 경로이며 실제 접속
        지역을 뜻하지 않습니다. 같은 사람이 여러 세션으로 나타날 수 있습니다.
        체험 결제와 실제 결제를 구분합니다.
      </p>
      <ErrorBox error={error} />
      <button className="button secondary" onClick={load}>
        새로고침
      </button>
      {!data && !error && <Loading />}
      {data && (
        <>
          <p>
            방문 세션 {data.total.toLocaleString()}건 · {page + 1}페이지
          </p>
          {data.visits.map((v: any) => (
            <section className="card" key={v.id}>
              <h2>방문 {v.id.slice(0, 8)}</h2>
              <p>
                첫 접속 {time(v.first_seen)} · 최근 {time(v.last_seen)}
              </p>
              <p>
                유입:{" "}
                {v.source === "direct" ? "직접 접속·경로 미확인" : v.source} ·
                시작: {label(v.entry_stage)} · 최근 단계: {label(v.last_stage)}
              </p>
              <details>
                <summary>진행 기록 ({v.events.length})</summary>
                <ol>
                  {v.events.map((e: any, i: number) => (
                    <li key={i}>
                      {time(e.at)} · {label(e.stage)}
                    </li>
                  ))}
                </ol>
              </details>
              {!v.orders.length && <p>연결된 구매 없음</p>}
              {v.orders.map((o: any) => (
                <div key={o.id}>
                  <p>
                    {o.live ? "실제 결제" : "체험 결제"} · 주문 {o.id} ·{" "}
                    {o.payment} · {o.fulfillment}
                    {o.paid_at ? " · 승인 " + time(o.paid_at) : " · 승인 전"}
                  </p>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      !o.paid_at ||
                      o.fulfillment !== "ready" ||
                      o.content_deleted ||
                      !o.expires ||
                      o.expires < Date.now()
                    }
                    onClick={() => show(o.id)}
                  >
                    받은 운명서 보기
                  </button>
                </div>
              ))}
            </section>
          ))}
          {!data.visits.length && <p>이 기간에 수집된 방문 기록이 없습니다.</p>}
          <div className="actions">
            <button
              className="button secondary"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전
            </button>
            <button
              className="button secondary"
              disabled={(page + 1) * 50 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              다음
            </button>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className="reading-detail-dialog"
        aria-labelledby="visitor-report-title"
        onClose={() => {
          setDetail(null);
          reportGeneration.current++;
        }}
      >
        <div className="reading-dialog-bar">
          <h2 id="visitor-report-title">구매자가 받은 운명서</h2>
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            닫기 ×
          </button>
        </div>
        {detail && book && (
          <div className="reading-detail-body">
            <h3>{detail.name || "구매자"} 님의 운명서</h3>
            <p>
              사주기둥:{" "}
              {detail.report.chart?.pillars?.filter(Boolean).join(" · ")}
            </p>
            <p>
              {detail.live ? "실제 결제" : "체험 결제"} · {detail.orderId} ·
              버전 {detail.version} · {time(detail.created)}
            </p>
            <p>{detail.report.intro}</p>
            {detail.report.chapters.map((c: any, i: number) => (
              <section key={i}>
                <h3>
                  {i + 1}. {c.title}
                </h3>
                <p>{book.chapters[i].text}</p>
                {book.chapters[i].practice && (
                  <p>{book.chapters[i].practice}</p>
                )}
                <p className="quote">{book.chapters[i].takeaway}</p>
              </section>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
