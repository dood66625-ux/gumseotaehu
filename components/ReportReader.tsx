"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useLoad, ErrorBox, Loading } from "./client";
export default function ReportReader({ id }: { id: string }) {
  const { data: d, error: loadError } = useLoad<any>("reports/" + id),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function pdf() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reports/" + id + "/pdf");
      if (!res.ok) {
        const v = await res.json();
        throw Error(v.error);
      }
      const blob = await res.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "geumseo-report.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("동일한 운명서의 한글 PDF를 내려받았습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError("");
    try {
      const r = await api("resend", { orderId: id });
      setMessage(r.message);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loadError)
    return (
      <>
        <ErrorBox error={loadError} />
        <div className="actions">
          <Link className="button secondary" href="/recover">
            이메일로 다시 찾기
          </Link>
          <Link className="button secondary" href="/help">
            문의·환불 신청
          </Link>
        </div>
      </>
    );
  if (!d) return <Loading />;
  return (
    <>
      <p className="eyebrow">A BOOK WRITTEN FOR YOU</p>
      <h1>
        {d.name} 님의
        <br />
        종합 운명서
      </h1>
      <p className="page-intro">
        {d.report.year}년 흐름 포함 · 버전 {d.order.version}
        <br />
        무료 재열람:{" "}
        {new Date(d.order.expires).toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}
        까지
      </p>
      <p className="notice">
        현재는 로컬 규칙 기반 모의 콘텐츠입니다. 실제 AI 생성 보고서가 아닙니다.
        정식 서비스는 AI 생성 사실을 표시합니다. 미래의 사실을 확정하거나 전문
        조언을 대신하지 않습니다.
      </p>
      <div className="actions">
        <button className="button" onClick={pdf} disabled={busy}>
          {busy ? "PDF 작성 중…" : "PDF 다운로드"}
        </button>
        <button className="button secondary" onClick={resend}>
          이메일로 받기
        </button>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <ErrorBox error={error} />
      <div className="card gold">
        <p className="quote">{d.report.intro}</p>
        <p className="hint">
          입력: {d.birth.date} ·{" "}
          {d.birth.calendar === "solar" ? "양력" : "음력"}
          {d.birth.leap ? " 윤달" : ""} · {d.birth.time || "시간 미상"} · 한국
          출생
        </p>
      </div>
      <nav className="report-nav" aria-label="운명서 목차">
        {d.report.chapters.map((c: any, i: number) => (
          <a key={c.title} href={"#chapter-" + i}>
            {i + 1}. {c.title}
          </a>
        ))}
      </nav>
      {d.report.chapters.map((c: any, i: number) => (
        <article id={"chapter-" + i} key={c.title} className="report-chapter">
          <p className="eyebrow">CHAPTER {String(i + 1).padStart(2, "0")}</p>
          <h2>{c.title}</h2>
          <p>{c.text}</p>
          <small className="chapter-fact">
            검증된 계산 근거: {c.claimIds.join(", ")}
          </small>
        </article>
      ))}
      <section className="card">
        <h2>계산 기준과 해석의 범위</h2>
        {d.report.notes.map((n: string) => (
          <p className="hint" key={n}>
            {n}
          </p>
        ))}
        <p className="hint">
          {d.report.chart.meta.engine} · {d.report.chart.meta.rules} ·{" "}
          {d.report.promptVersion}
        </p>
      </section>
      <div className="actions">
        <Link className="button secondary" href="/recover">
          내 운명서 다시 찾기
        </Link>
        <Link className="button secondary" href="/help">
          문의·정정·환불
        </Link>
      </div>
    </>
  );
}
