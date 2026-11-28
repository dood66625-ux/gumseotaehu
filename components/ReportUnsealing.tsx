"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { defaultWritingLines } from "../lib/writing-lines";
const writingScenes = [
  {
    image: "/empress-royal-v2.webp",
    alt: "금서를 살피는 금서태후",
  },
  {
    image: "/story/scene-4.webp",
    alt: "금서를 조심스럽게 펼치는 태후",
  },
  {
    image: "/story/scene-5.webp",
    alt: "어둠 속에서 금빛을 머금은 금서",
  },
];
export default function ReportUnsealing({
  id,
  ready,
  children,
  preview = false,
  skipIntro = false,
  writingLines,
}: {
  id: string;
  ready: boolean;
  children?: ReactNode;
  preview?: boolean;
  skipIntro?: boolean;
  writingLines?: string[];
}) {
  const lines =
    Array.isArray(writingLines) &&
    writingLines.length === 3 &&
    writingLines.every(
      (line) =>
        typeof line === "string" && line.length > 0 && line.length <= 160,
    )
      ? writingLines
      : defaultWritingLines;
  const [waitingLine, setWaitingLine] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [intro, setIntro] = useState(!ready && !skipIntro);
  const [scene, setScene] = useState(0);
  function finishIntro() {
    setIntro(false);
    if (!preview) {
      try {
        sessionStorage.setItem("gumseo-writing-intro:" + id, "seen");
      } catch {}
    }
  }
  useEffect(() => {
    if (!preview) {
      try {
        if (sessionStorage.getItem("gumseo-writing-intro:" + id) === "seen")
          setIntro(false);
      } catch {}
    }
  }, [id, preview]);
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => {
      if (scene < writingScenes.length - 1) setScene(scene + 1);
      else finishIntro();
    }, 3000);
    return () => clearTimeout(timer);
  }, [intro, scene, id, preview]);
  useEffect(() => {
    if (ready && !intro && !dialog.current?.open) dialog.current?.showModal();
  }, [ready, intro]);
  useEffect(() => {
    if (intro || ready) return;
    const timer = setInterval(() => setWaitingLine((n) => (n + 1) % 3), 6000);
    return () => clearInterval(timer);
  }, [intro, ready]);
  if (intro)
    return (
      <section
        className="report-unsealing writing-prologue"
        aria-label="운명서를 여는 이야기"
      >
        <div className="writing-scenes" aria-live="polite" aria-atomic="true">
          {writingScenes.map((item, index) => (
            <figure
              key={item.image}
              className={
                index === scene ? "writing-scene active" : "writing-scene"
              }
              aria-hidden={index !== scene}
            >
              <img
                src={item.image}
                alt={item.alt}
                width="800"
                height="1200"
                decoding="async"
              />
              <figcaption>{lines[index]}</figcaption>
            </figure>
          ))}
        </div>
        <button
          className="writing-skip"
          onClick={finishIntro}
          aria-label="이야기 건너뛰고 작성 화면으로"
        >
          SKIP &gt;
        </button>
      </section>
    );
  return (
    <section className="report-unsealing" aria-label="운명서 펼치기">
      <svg
        className={ready ? "unsealing-mark complete" : "unsealing-mark"}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="unsealing-halo">
            <stop offset="0%" stopColor="#f1d28e" stopOpacity=".48" />
            <stop offset="48%" stopColor="#dfb45f" stopOpacity=".33" />
            <stop offset="75%" stopColor="#c9963e" stopOpacity=".12" />
            <stop offset="100%" stopColor="#b88735" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="unsealing-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f2dfaa" />
            <stop offset="48%" stopColor="#d0aa60" />
            <stop offset="100%" stopColor="#a8782f" />
          </linearGradient>
        </defs>
        <circle
          className="unsealing-halo"
          cx="100"
          cy="100"
          r="170"
          fill="url(#unsealing-halo)"
        />
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
        <circle
          className="unsealing-orbit"
          cx="100"
          cy="100"
          r="94"
          fill="none"
          stroke="#ffe7a5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="55 536"
        />
      </svg>
      <h1 aria-live="polite">
        {ready ? "그대의 금서가 준비되었느니라" : "운명서 펼치는 중…"}
      </h1>
      <p className="unsealing-personal-line">
        {ready ? "이제 그대의 이야기를 만나 보거라." : lines[waitingLine]}
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
