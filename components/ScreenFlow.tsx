"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
/** Keeps page contents mounted: changing pages never resets a form or triggers requests. */
export default function ScreenFlow({
  pages,
  label = "기운의 해석",
}: {
  pages: { title: string; content: ReactNode }[];
  label?: string;
}) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState("forward");
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page]);
  return (
    <section
      className="screen-flow"
      ref={root}
      tabIndex={-1}
      aria-label={label}
      data-direction={direction}
    >
      <header className="screen-flow-heading">
        <span>{label}</span>
        <span aria-live="polite">
          {page + 1} / {pages.length}
        </span>
      </header>
      {pages.map((item, index) => (
        <section
          key={index}
          className="screen-flow-page"
          hidden={page !== index}
          aria-label={item.title}
        >
          <div className="screen-flow-portrait">
            <div
              className="empress-expression"
              role="img"
              aria-label={`금서태후의 ${["반기는", "귀 기울이는", "응원하는", "미소 짓는", "평온한", "궁금해하는", "기쁘게 웃는", "책을 살피는"][index % 8]} 초상`}
              style={{
                backgroundImage:
                  index % 8 < 4
                    ? "var(--empress-expressions-first)"
                    : "var(--empress-expressions-second)",
                backgroundPosition: `${index % 2 ? "100%" : "0%"} ${index % 4 >= 2 ? "100%" : "0%"}`,
              }}
            />
          </div>
          <div className="screen-flow-copy">
            <h1>{item.title}</h1>
            {item.content}
          </div>
        </section>
      ))}
      <nav className="screen-flow-controls" aria-label="화면 넘기기">
        <button
          type="button"
          className="button secondary"
          aria-label="이전"
          disabled={page === 0}
          onClick={() => {
            setDirection("backward");
            setPage(page - 1);
          }}
        >
          <span aria-hidden="true">〈</span>
        </button>
        <button
          type="button"
          className="button"
          aria-label="다음 →"
          disabled={page === pages.length - 1}
          onClick={() => {
            setDirection("forward");
            setPage(page + 1);
          }}
        >
          <span aria-hidden="true">〉</span>
        </button>
      </nav>
      <nav className="birth-policy-links" aria-label="이용 정책">
        <a href="/legal/privacy">개인정보</a>
        <a href="/legal/business">사업자 정보</a>
        <a href="/help">이용 안내</a>
      </nav>
    </section>
  );
}
