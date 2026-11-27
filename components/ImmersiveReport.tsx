"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ReportScene } from "../lib/report-scenes";
import ReportTypeImage from "./ReportTypeImage";
import ReadableText from "./ReadableText";
export default function ImmersiveReport({
  orderId,
  scenes,
  assetBase = "",
  children,
  counsel,
}: {
  orderId: string;
  scenes: ReportScene[];
  assetBase?: string;
  children: ReactNode;
  counsel: (active: boolean) => ReactNode;
}) {
  const [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(false),
    [folded, setFolded] = useState(false),
    [loaded, setLoaded] = useState(false);
  const copy = useRef<HTMLDivElement>(null),
    title = useRef<HTMLHeadingElement>(null);
  const storage = "gumseo-report-page:" + orderId;
  useEffect(() => {
    try {
      const p = Number(sessionStorage.getItem(storage));
      if (Number.isInteger(p) && p >= 0 && p <= scenes.length + 1) setPage(p);
    } catch {}
    setLoaded(true);
  }, [storage, scenes.length]);
  useEffect(() => {
    if (loaded)
      try {
        sessionStorage.setItem(storage, String(page));
      } catch {}
  }, [page, loaded, storage]);
  function turn(next: number) {
    setPage(Math.max(0, Math.min(scenes.length + 1, next)));
    setFolded(false);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    if (copy.current) copy.current.scrollTop = 0;
    title.current?.focus({ preventScroll: true });
  }, [page]);
  const overview = (
    <section
      className="report-overview"
      hidden={page !== scenes.length + 1}
      aria-label="전체 운명서"
    >
      <div className="report-overview-bar">
        <button className="button secondary" onClick={() => turn(0)}>
          장별로 다시 읽기
        </button>
        <button
          className="button secondary"
          onClick={() => turn(scenes.length)}
        >
          태후에게 자문하기
        </button>
        <span>그대의 운명서, 한눈에 펼쳐 보거라.</span>
      </div>
      {children}
    </section>
  );
  const isCounsel = page === scenes.length;
  const scene = isCounsel
    ? {
        key: "counsel",
        title: "태후에게 세 번의 자문을 구하거라",
        eyebrow: "편지에 이어지는 대화",
        text: "",
      }
    : scenes[Math.min(page, scenes.length - 1)];
  return (
    <>
      <section
        className="immersive-report-stage"
        hidden={page > scenes.length}
        aria-label="태후와 읽는 운명서"
        onKeyDown={(e) => {
          if (
            (e.target as HTMLElement).closest("button,a,input,textarea") ||
            e.altKey ||
            e.ctrlKey ||
            e.metaKey
          )
            return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            turn(page + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            turn(page - 1);
          }
        }}
      >
        <header className="immersive-report-header">
          <span aria-live="polite">
            {page + 1} / {scenes.length + 2} · {scene.eyebrow}
          </span>
          <a href="/recover">내 운명서 찾기</a>
        </header>
        <div className="immersive-report-portrait" aria-hidden="true">
          {scene.imageIndex !== undefined ? (
            <ReportTypeImage
              index={scene.imageIndex}
              name={scene.title}
              assetBase={assetBase}
            />
          ) : (
            <div
              className="empress-expression"
              style={{
                backgroundImage: `url(${assetBase}/empress-expressions-${page % 8 < 4 ? 1 : 2}.webp)`,
                backgroundPosition: `${page % 2 ? "100%" : "0%"} ${page % 4 >= 2 ? "100%" : "0%"}`,
              }}
            />
          )}
        </div>
        <section
          className="immersive-copy-panel"
          data-expanded={expanded}
          data-folded={folded}
          aria-labelledby={isCounsel ? "counsel-title" : "scene-title"}
        >
          <div className="scene-panel-tools" hidden={isCounsel}>
            <span className="scene-panel-handle" aria-hidden="true" />
            <div>
              <button
                type="button"
                onClick={() => {
                  setExpanded(!expanded);
                  setFolded(false);
                }}
                aria-expanded={expanded}
              >
                {expanded ? "반으로 줄이기" : "위로 펼치기"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFolded(!folded);
                  setExpanded(folded);
                }}
                aria-expanded={!folded}
              >
                {folded ? "글 읽기" : "접기"}
              </button>
            </div>
          </div>
          <h1 ref={title} id="scene-title" tabIndex={-1} hidden={isCounsel}>
            {scene.title}
          </h1>
          <div
            ref={copy}
            className="immersive-scene-text"
            hidden={folded}
            tabIndex={0}
            role="region"
            aria-label={scene.title + " 본문"}
          >
            <div hidden={isCounsel}>
              <ReadableText text={scene.text} />
            </div>
            <div hidden={!isCounsel}>{counsel(isCounsel)}</div>
          </div>
          {!folded && !isCounsel && (
            <p className="scene-scroll-hint">
              글상자 안에서 아래로 읽어 보거라.
            </p>
          )}
          <div className="scene-footer">
            <button type="button" onClick={() => turn(scenes.length + 1)}>
              전체 운명서
            </button>
          </div>
        </section>
        <nav className="immersive-report-arrows" aria-label="운명서 장 넘기기">
          <button
            type="button"
            aria-label="이전 장"
            disabled={page === 0}
            onClick={() => turn(page - 1)}
          >
            〈
          </button>
          <button
            type="button"
            aria-label={
              page === scenes.length ? "전체 운명서 펼치기" : "다음 장"
            }
            onClick={() => turn(page + 1)}
          >
            〉
          </button>
        </nav>
      </section>
      {overview}
    </>
  );
}
