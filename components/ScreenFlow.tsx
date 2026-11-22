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
          <h1>{item.title}</h1>
          {item.content}
        </section>
      ))}
      <nav className="screen-flow-controls" aria-label="화면 넘기기">
        <button
          type="button"
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          이전
        </button>
        <button
          type="button"
          className="button"
          disabled={page === pages.length - 1}
          onClick={() => setPage(page + 1)}
        >
          다음 →
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
