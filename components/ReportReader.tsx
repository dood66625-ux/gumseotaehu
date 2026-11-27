"use client";
import ImmersiveReport from "./ImmersiveReport";
import { reportScenes } from "../lib/report-scenes";
import ReportType from "./ReportType";
import { taehouNarration } from "../lib/taehou-narration";
import ReadableText from "./ReadableText";
import TaehouCounsel, { type CounselView } from "./TaehouCounsel";
import ReportFocus from "./ReportFocus";
import ReportTop3 from "./ReportTop3";
import ReportClosing from "./ReportClosing";
import ReadingDetails from "./ReadingDetails";
import { readingExcerpt } from "../lib/reading-excerpt";
import { reportBook } from "../lib/report-book";
import Link from "next/link";
import { chapterArt } from "../lib/report-art";
import { readingGuide } from "../lib/report-reading-guide";
import { reportDisclosure } from "../lib/report-disclosure";
import { useLayoutEffect, useRef, useState } from "react";
import { reportDownload } from "../lib/report-download";
import { reportFigures } from "../lib/report-figures";
import CourtPortrait from "./CourtPortrait";
import { api, useLoad, ErrorBox, Loading } from "./client";
function canSharePdf() {
  try {
    return (
      !!navigator.share &&
      !!navigator.canShare?.({
        files: [
          new File([""], "geumseo-report.pdf", { type: "application/pdf" }),
        ],
      })
    );
  } catch {
    return false;
  }
}
export default function ReportReader({
  id,
  assetBase = "",
}: {
  id: string;
  assetBase?: string;
}) {
  const { data: d, error: loadError } = useLoad<any>("reports/" + id),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [inKakao, setInKakao] = useState<boolean | null>(null),
    [shareFile, setShareFile] = useState<File | null>(null),
    [nativePdfShare, setNativePdfShare] = useState(false),
    [counselView, setCounselView] = useState<CounselView | null>(null);
  const generation = useRef(0);
  const pendingPdf = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    generation.current++;
    setInKakao(/KAKAOTALK/i.test(navigator.userAgent));
    setShareFile(null);
    setCounselView(null);
    setNativePdfShare(canSharePdf());
    setMessage("");
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
      pendingPdf.current?.abort();
      pendingPdf.current = null;
    };
  }, [id]);
  async function preparePdf() {
    if (!canSharePdf()) return;
    pendingPdf.current?.abort();
    const current = generation.current,
      controller = new AbortController();
    pendingPdf.current = controller;
    setBusy(true);
    setShareFile(null);
    setError("");
    try {
      const blob = await reportDownload(id, controller.signal);
      if (current === generation.current && !controller.signal.aborted)
        setShareFile(
          new File([blob], "geumseo-report.pdf", { type: "application/pdf" }),
        );
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (pendingPdf.current === controller) {
        pendingPdf.current = null;
        if (current === generation.current) setBusy(false);
      }
    }
  }
  async function pdf() {
    if (busy || pendingPdf.current) return;
    setError("");
    setMessage("");
    if (nativePdfShare) {
      if (!shareFile) {
        await preparePdf();
        return;
      }
      try {
        await navigator.share({
          files: [shareFile],
          title: "금서태후 · 나의 운명서",
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError(
            "공유창을 열지 못했구나. 메일로 받거나 Safari·Chrome에서 다시 열어 보거라.",
          );
      }
      return;
    }
    const current = generation.current,
      controller = new AbortController();
    pendingPdf.current = controller;
    setBusy(true);
    try {
      const blob = await reportDownload(id, controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "geumseo-report.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "PDF 저장을 요청했느니라. 브라우저의 다운로드 목록을 확인해 보거라.",
      );
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (pendingPdf.current === controller) pendingPdf.current = null;
      if (current === generation.current) setBusy(false);
    }
  }
  async function resend() {
    const current = generation.current;
    setError("");
    try {
      const r = await api("resend", { orderId: id });
      if (current === generation.current) setMessage(r.message);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
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
        </div>
      </>
    );
  if (!d) return <Loading />;
  const book = reportBook(d.report);
  const guide = readingGuide(d.report);
  const figures = reportFigures(d.report.chart.element);
  return (
    <ImmersiveReport
      key={id}
      orderId={id}
      scenes={reportScenes(d.report, d.name)}
      assetBase={assetBase}
      onOverview={preparePdf}
      remainingCounsel={counselView?.remaining ?? null}
      overviewRevision={
        counselView?.entries
          .filter((e) => !!e.answer)
          .map((e) => e.id)
          .join(",") ?? ""
      }
      footerActions={
        <>
          {(!inKakao || nativePdfShare) && (
            <button className="button" onClick={pdf} disabled={busy}>
              {busy
                ? "PDF 준비 중…"
                : nativePdfShare && !shareFile
                  ? "PDF 준비하기"
                  : "PDF 저장"}
            </button>
          )}
          <button className="button secondary" onClick={resend}>
            메일로 보내기
          </button>
        </>
      }
      footerMessage={
        <>
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <ErrorBox error={error} />
        </>
      }
      disclosure={
        <>
          <details className="report-disclosure">
            <summary>이 운명서의 콘텐츠·제공 안내</summary>
            <p>{reportDisclosure(d.report.provider).description}</p>
          </details>
        </>
      }
      counsel={(active, onComplete) => (
        <TaehouCounsel
          key={id + "-counsel"}
          orderId={id}
          active={active}
          onComplete={onComplete}
          onViewChange={setCounselView}
        />
      )}
    >
      <div className="report-reader">
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
        <div className="report-cover illustrated-cover">
          <strong>禁書</strong>
          <p>{d.name} 님을 위해 펼친 아홉 장의 이야기</p>
          <small>금서태후의 종합 운명서 · {d.report.year}</small>
        </div>
        <div className="card gold">
          <img
            className="mini-portrait"
            src={assetBase + "/empress-avatar-v2.webp"}
            width="85"
            height="108"
            alt="금서태후"
          />
          <p className="quote">{taehouNarration(d.report.intro)}</p>
          <p className="hint">
            입력: {d.birth.date} ·{" "}
            {d.birth.calendar === "solar" ? "양력" : "음력"}
            {d.birth.leap ? " 윤달" : ""} · {d.birth.time || "시간 미상"} · 한국
            출생
          </p>
        </div>
        <ReportType chart={d.report.chart} />
        <ReportFocus key={id} />
        <nav className="report-nav" aria-label="운명서 목차">
          {d.report.chapters.map((c: any, i: number) => (
            <a key={c.title} href={"#chapter-" + i}>
              {i + 1}. {c.title}
            </a>
          ))}
          <a href="#reading-guide-title">쉽게 읽는 내 운명서</a>
        </nav>
        {d.report.chapters.map((c: any, i: number) => (
          <article id={"chapter-" + i} key={c.title} className="report-chapter">
            <p className="eyebrow">CHAPTER {String(i + 1).padStart(2, "0")}</p>
            <h2>{c.title}</h2>
            <figure className="chapter-illustration">
              <img
                src={assetBase + chapterArt[i].src}
                alt={chapterArt[i].alt}
                width="508"
                height="337"
                loading="lazy"
              />
              <figcaption>{chapterArt[i].title}</figcaption>
            </figure>
            <ReadingDetails
              title={c.title}
              brief={<p>{readingExcerpt(book.chapters[i].text, 150)}</p>}
            >
              <ReadableText text={book.chapters[i].text} />
              {book.chapters[i].practice && (
                <section>
                  <h3>그대의 일상에 가져가 보거라</h3>
                  <ReadableText text={book.chapters[i].practice} />
                </section>
              )}
            </ReadingDetails>
            {book.chapters[i].takeaway && (
              <aside className="card gold" aria-label="이 장의 한마디">
                <p className="eyebrow">이 장의 한마디</p>
                <p className="quote">{book.chapters[i].takeaway}</p>
              </aside>
            )}
          </article>
        ))}
        <section
          className="card reading-guide"
          aria-labelledby="reading-guide-title"
        >
          <p className="eyebrow">IN EVERYDAY WORDS</p>
          <h2 id="reading-guide-title">쉽게 읽는 내 운명서</h2>
          <p className="hint">
            아홉 장의 이야기가 마음에 닿았느냐? 이제 그대의 일상에 가져갈 말을
            쉬이 풀어 주겠노라.
          </p>
          <figure>
            <img
              src={assetBase + guide.artwork}
              alt={guide.artworkAlt}
              width="640"
              height="460"
              loading="lazy"
            />
            <figcaption>
              나를 읽는 출발점 · {d.report.chart.element}의 상징
            </figcaption>
          </figure>
          <h3>그대의 결을 다시 짚어 보거라</h3>
          <p>{guide.lead}</p>
          <p className="quote">오늘은 이 한 가지를 해보거라 · {guide.action}</p>
          {guide.points.map((point) => (
            <div key={point.title}>
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </div>
          ))}
          <p className="hint">
            <a
              href={
                assetBase ? assetBase + "/?screen=content" : "/legal/content"
              }
            >
              이 풀이의 제공 안내
            </a>
          </p>
        </section>
        <ReportTop3 element={d.report.chart.element} />
        <CourtPortrait key={id} element={d.report.chart.element} />
        {figures && (
          <section className="card gold" aria-label={figures.title}>
            <p className="eyebrow">人物 · 세 갈래의 빛</p>
            <h2>{figures.title}</h2>
            <p>{figures.lead}</p>
            {figures.people.map((person, i) => (
              <section key={person.name}>
                <h3>
                  {i + 1}. {person.name}
                </h3>
                <p>{person.work}</p>
                <p className="quote">{person.lesson}</p>
              </section>
            ))}
          </section>
        )}
        <ReportClosing report={d.report} name={d.name} />
        {!!counselView?.entries.length && (
          <section
            className="report-counsel-transcript card gold"
            aria-label="태후와 나눈 자문"
          >
            <h2>태후와 나눈 자문</h2>
            {counselView.entries.map((e) => (
              <article key={e.id} className="counsel-transcript-entry">
                <h3>
                  {["첫번째 자문", "두번째 자문", "세번째 자문"][e.number - 1]}
                </h3>
                <p className="counsel-question">{e.question}</p>
                {e.answer ? (
                  <ReadableText text={e.answer} />
                ) : (
                  <p role="status">
                    {e.state === "failed"
                      ? "답문을 마무리하지 못했구나."
                      : "답문을 적고 있느니라…"}
                  </p>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </ImmersiveReport>
  );
}
