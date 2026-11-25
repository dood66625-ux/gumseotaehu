"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, ErrorBox, Loading } from "./client";
import { visitStages } from "../lib/visit-stages";
import { reportBook } from "../lib/report-book";
const time = (n: number) =>
  new Date(n).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default function VisitorAdmin() {
  const [page, setPage] = useState(0),
    [sort, setSort] = useState("recent"),
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
      const next = await api("admin/visitors?sort=" + sort + "&page=" + page);
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
  }, [page, sort]);
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
  const source = (value: string | null) =>
    !value || value === "direct" ? "직접 접속·경로 미확인" : value;
  const paid = (v: any) =>
    v.orders.some((o: any) => o.live && o.paid_at && o.payment === "paid");
  const state = (v: any) =>
    paid(v)
      ? "구매 완료"
      : v.last_stage === "checkout"
        ? "결제 화면 도달"
        : v.last_stage === "preview"
          ? "무료 풀이 확인"
          : "방문 중";
  const stats = data?.summary;

  return (
    <div className="page visitor-admin">
      <header className="visitor-admin-heading">
        <div>
          <p className="visitor-admin-eyebrow">GEUMSEO ADMIN</p>
          <h1>방문자 로그</h1>
          <p className="visitor-admin-caption">
            최근 30일 · 같은 접속망은 한 묶음 · 페이지당 15건
          </p>
        </div>
        <nav aria-label="관리자 메뉴">
          <a href="/admin">운영 관리·비밀번호</a>
          <a href="/" target="_blank" rel="noreferrer">
            사이트 보기 ↗
          </a>
          <button onClick={load}>새로고침</button>
          <button
            onClick={async () => {
              try {
                await api("logout", {});
                location.assign("/admin");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            로그아웃
          </button>
        </nav>
      </header>
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <section
            className="visitor-admin-metrics"
            aria-label="오늘의 방문 요약"
          >
            <article>
              <span>오늘 방문</span>
              <strong>
                {stats?.todayVisitors?.toLocaleString() ?? "—"}
                <small>개 접속망</small>
              </strong>
              <p>방문 기록 {stats?.todaySessions ?? 0}건 · 한국 시간 기준</p>
            </article>
            <article>
              <span>오늘 결제 화면 도달</span>
              <strong>
                {stats?.todayCheckout ?? "—"}
                <small>개 접속망</small>
              </strong>
              <p>결제 전 이탈 흐름 확인</p>
            </article>
            <article>
              <span>오늘 주요 유입</span>
              <strong className="visitor-admin-source">
                {stats?.topSource ? source(stats.topSource) : "방문 기록 없음"}
              </strong>
              <p>오늘 접속한 방문 기준</p>
            </article>
            <article>
              <span>오늘 구매 전환</span>
              <strong>
                {stats?.todayPurchases ?? "—"}
                <small>건</small>
              </strong>
              <p>실제 승인·구매 연결 기록만 집계</p>
            </article>
          </section>
          <details className="visitor-admin-note">
            <summary>집계 기준 및 관리자 접속 제외 안내</summary>
            <p>
              모의 구매·자동 테스트·확인된 관리자 접속망은 제외합니다. 같은 IP는
              같은 사람을 뜻하지 않으며, 관리자와 같은 접속망을 쓰는 방문자도
              제외될 수 있습니다. IP 원문·위치·체류 시간은 수집하지 않습니다.
              기록은 30일 보관합니다.
            </p>
          </details>
          <div className="visitor-admin-toolbar">
            <label>
              목록 정렬
              <select
                value={sort}
                onChange={(e) => {
                  setPage(0);
                  setSort(e.target.value);
                }}
              >
                <option value="recent">최근 접속순</option>
                <option value="repeat">재방문 많은 순</option>
              </select>
            </label>
            <p>
              방문 묶음 {data.total.toLocaleString()}건 · {page + 1}/
              {Math.max(1, Math.ceil(data.total / 15))}페이지 · 페이지당 15건
            </p>
          </div>
          <div className="visitor-admin-list">
            {data.visits.map((v: any) => (
              <section
                className={
                  "visitor-admin-row" + (paid(v) ? " is-purchased" : "")
                }
                key={v.id}
              >
                <div className="visitor-admin-columns">
                  <div>
                    <span>방문 식별</span>
                    <strong>{v.id.slice(0, 8)}</strong>
                    <small>접속망으로 묶음</small>
                  </div>
                  <div>
                    <span>최근 접속</span>
                    <strong>{time(v.last_seen)}</strong>
                    <small>첫 접속 {time(v.first_seen)}</small>
                  </div>
                  <div>
                    <span>방문 횟수</span>
                    <strong>{v.sessionCount ?? 1}회</strong>
                  </div>
                  <div>
                    <span>최근 유입</span>
                    <strong>{source(v.source)}</strong>
                  </div>
                  <div>
                    <span>최근 도달 단계</span>
                    <strong>{label(v.last_stage)}</strong>
                    <small>시작: {label(v.entry_stage)}</small>
                  </div>
                  <div>
                    <span>구매 전환</span>
                    <strong
                      className={
                        "visitor-admin-badge" + (paid(v) ? " is-paid" : "")
                      }
                    >
                      {state(v)}
                    </strong>
                  </div>
                </div>
                <div className="visitor-admin-row-bottom">
                  <details className="visitor-admin-history">
                    <summary>
                      {v.sessionCount > 1
                        ? `중복 접속 ${v.sessionCount}건 펼치기`
                        : "방문 상세보기"}
                    </summary>
                    {(v.sessions ?? [v]).map((item: any) => (
                      <details key={item.id} className="visitor-admin-session">
                        <summary>
                          {time(item.first_seen)} ~ {time(item.last_seen)} ·{" "}
                          {label(item.last_stage)}
                        </summary>
                        <ol>
                          {item.events.map((e: any, i: number) => (
                            <li key={i}>
                              <time>{time(e.at)}</time>
                              <span>{label(e.stage)}</span>
                            </li>
                          ))}
                        </ol>
                        {!item.events.length && (
                          <p>상세 진행 기록이 없습니다.</p>
                        )}
                      </details>
                    ))}
                    {v.sessionCount > (v.sessions ?? []).length && (
                      <p>최근 {v.sessions.length}건을 표시합니다.</p>
                    )}
                  </details>
                  <div className="visitor-admin-orders">
                    {v.orders.map((o: any) => (
                      <div key={o.id}>
                        <small>
                          주문 {o.id.slice(0, 8)} ·{" "}
                          {o.payment === "paid"
                            ? "승인 완료"
                            : o.payment === "refunded"
                              ? "환불 완료"
                              : "승인 전"}
                        </small>
                        <button
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
                          받은 운명서 보기 ↗
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
            {!data.visits.length && (
              <div className="visitor-admin-empty">
                이 기간에 수집된 방문 기록이 없습니다.
              </div>
            )}
          </div>
          <div className="visitor-admin-pagination">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              이전
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(data.total / 15))}
            </span>
            <button
              disabled={(page + 1) * 15 >= data.total}
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
