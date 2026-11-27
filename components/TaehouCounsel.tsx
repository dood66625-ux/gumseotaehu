"use client";
import { useEffect, useRef, useState } from "react";
import { api, ErrorBox, useLoad } from "./client";
import ReadableText from "./ReadableText";
import type { CounselEntry } from "../lib/taehou-counsel";
export type CounselView = {
  entries: CounselEntry[];
  remaining: number;
  total: number;
};
type View = CounselView;
const tabs = ["첫번째 자문", "두번째 자문", "세번째 자문"];
export default function TaehouCounsel({
  orderId,
  active = true,
  onComplete,
  onViewChange,
}: {
  orderId: string;
  active?: boolean;
  onComplete?: () => void;
  onViewChange?: (view: CounselView) => void;
}) {
  const path = "reports/" + orderId + "/counsel";
  const { data, error: loadError, load } = useLoad<View>(path);
  const [view, setView] = useState<View | null>(null),
    [question, setQuestion] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<{ question: string; id: string } | null>(null),
    watch = useRef<string | null>(null);
  useEffect(() => {
    if (view) onViewChange?.(view);
  }, [view, onViewChange]);
  const pending = !!view?.entries.some(
    (e) => e.state === "queued" || e.state === "working",
  );
  function show(number: number) {
    setSelected(number);
    if (active && !dialog.current?.open) dialog.current?.showModal();
  }
  useEffect(() => {
    if (!active) dialog.current?.close();
  }, [active]);
  useEffect(() => {
    if (data) setView(data);
  }, [data]);
  useEffect(() => {
    if (!view) return;
    const waiting = view.entries.find(
      (e) => e.state === "queued" || e.state === "working",
    );
    if (waiting && !watch.current) watch.current = waiting.id;
    const finished = view.entries.find(
      (e) => e.id === watch.current && (e.answer || e.state === "failed"),
    );
    if (finished && active) {
      if (!dialog.current?.open || selected === finished.number)
        show(finished.number);
      watch.current = null;
    }
  }, [view, active, selected]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => load(), 3000);
    return () => clearInterval(timer);
  }, [pending, load]);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending || !question.trim() || !view || view.remaining <= 0)
      return;
    setBusy(true);
    setError("");
    const value = question.trim();
    if (request.current?.question !== value)
      request.current = { question: value, id: crypto.randomUUID() };
    try {
      const next = await api<View>(path, {
        question: value,
        requestId: request.current!.id,
      });
      setView(next);
      setQuestion("");
      request.current = null;
      const latest = next.entries.at(-1);
      if (latest) {
        watch.current =
          latest.answer || latest.state === "failed" ? null : latest.id;
        show(latest.number);
      }
    } catch (e) {
      setError((e as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }
  const entry = view?.entries.find((e) => e.number === selected);
  return (
    <section
      className="card gold taehou-counsel"
      aria-labelledby="counsel-title"
    >
      <div className="counsel-heading-row">
        <h2 id="counsel-title">
          태후에게 세번의 자문을 구하거라{" "}
          <span className="counsel-count">
            ({view ? view.remaining : "…"}/3)
          </span>
        </h2>
        {!!view?.entries.length && (
          <button
            type="button"
            className="counsel-history-trigger"
            aria-label="이전 자문 보기"
            title="이전 자문 보기"
            onClick={() => show(view.entries.at(-1)!.number)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path
                d="M3 11a9 9 0 1 1 2.4 7.1M3 4v7h7M12 7v5l3 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <form onSubmit={ask}>
        <textarea
          id="counsel-question"
          aria-label="태후에게 올릴 물음"
          value={question}
          onChange={(e) =>
            setQuestion(Array.from(e.target.value).slice(0, 50).join(""))
          }
          disabled={!view || busy || pending || view.remaining <= 0}
        />
        <button
          className="button counsel-submit"
          disabled={
            !view || busy || pending || view.remaining <= 0 || !question.trim()
          }
        >
          자문 구하기
        </button>
      </form>
      <ErrorBox error={error || loadError} />
      <dialog
        ref={dialog}
        className="counsel-answer-dialog"
        aria-label="태후의 자문"
      >
        <div
          className="counsel-tabs"
          role="tablist"
          aria-label="자문 기록"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const available = view?.entries.map((e) => e.number) ?? [];
            if (!available.length) return;
            const index = available.indexOf(selected),
              next =
                event.key === "Home"
                  ? available[0]
                  : event.key === "End"
                    ? available.at(-1)!
                    : available[
                        (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          available.length) %
                          available.length
                      ];
            setSelected(next);
            dialog.current
              ?.querySelector<HTMLButtonElement>(`[data-number="${next}"]`)
              ?.focus();
          }}
        >
          {tabs.map((label, i) => (
            <button
              type="button"
              role="tab"
              key={label}
              id={"counsel-tab-" + (i + 1)}
              data-number={i + 1}
              aria-selected={selected === i + 1}
              aria-controls="counsel-answer-panel"
              tabIndex={selected === i + 1 ? 0 : -1}
              disabled={!view?.entries.some((e) => e.number === i + 1)}
              onClick={() => setSelected(i + 1)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id="counsel-answer-panel"
          className="counsel-answer-body"
          role="tabpanel"
          aria-labelledby={"counsel-tab-" + selected}
          tabIndex={0}
          key={selected}
        >
          <p className="counsel-question">{entry?.question}</p>
          {entry?.answer ? (
            <ReadableText text={entry.answer} />
          ) : (
            <p role="status">
              {entry?.state === "failed"
                ? "답문을 마무리하지 못했구나. 같은 질문을 다시 보내지 말고 주문 확인을 요청해 주거라."
                : "그대의 물음에 답문을 적고 있느니라…"}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button counsel-thanks"
          onClick={() => {
            dialog.current?.close();
            if (
              selected === 3 &&
              view?.remaining === 0 &&
              view.entries.every((e) => !!e.answer)
            )
              onComplete?.();
          }}
        >
          감사합니다.
        </button>
      </dialog>
    </section>
  );
}
