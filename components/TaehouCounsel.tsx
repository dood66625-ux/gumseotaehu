"use client";
import { useEffect, useRef, useState } from "react";
import { api, ErrorBox, useLoad } from "./client";
import ReadableText from "./ReadableText";
import type { CounselEntry } from "../lib/taehou-counsel";
type View = { entries: CounselEntry[]; remaining: number; total: number };
export default function TaehouCounsel({ orderId }: { orderId: string }) {
  const path = "reports/" + orderId + "/counsel";
  const { data, error: loadError, load } = useLoad<View>(path);
  const [view, setView] = useState<View | null>(null),
    [question, setQuestion] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<{ question: string; id: string } | null>(null);
  useEffect(() => {
    if (data) setView(data);
  }, [data]);
  const pending = !!view?.entries.some(
    (e) => e.state === "queued" || e.state === "working",
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => load(), 3000);
    return () => clearInterval(timer);
  }, [pending, load]);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending || !question.trim()) return;
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
    } catch (e) {
      setError((e as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card gold taehou-counsel"
      aria-labelledby="counsel-title"
    >
      <p className="eyebrow">금서태후의 자문</p>
      <h2 id="counsel-title">
        태후에게 자문을 구해보세요{" "}
        <span className="counsel-count">({view ? view.remaining : "…"}/3)</span>
      </h2>
      <p>그대의 운명서를 읽고 마음에 남은 물음 하나를 들려주거라.</p>
      <p className="hint">
        질문은 50자까지. 주고받은 이야기는 운명서와 새로 내려받는 PDF에 함께
        남느니라.
      </p>
      {view?.entries.map((e) => (
        <article className="counsel-entry" key={e.id}>
          <p className="eyebrow">자문 {e.number}</p>
          <p className="counsel-question">{e.question}</p>
          {e.answer ? (
            <ReadableText text={e.answer} />
          ) : (
            <p role="status">
              {e.state === "failed"
                ? "답변을 마무리하지 못했구나. 같은 질문을 다시 보내지 말고 고객 문의로 확인해 주거라."
                : "그대의 물음에 답하고 있느니라…"}
            </p>
          )}
        </article>
      ))}
      {view && view.remaining > 0 ? (
        <form onSubmit={ask}>
          <label htmlFor="counsel-question">태후에게 올릴 물음</label>
          <textarea
            id="counsel-question"
            value={question}
            onChange={(e) =>
              setQuestion(Array.from(e.target.value).slice(0, 50).join(""))
            }
            disabled={busy || pending}
            placeholder="예: 일을 시작할 때 어떤 장점을 살리면 좋을까요?"
            aria-describedby="counsel-length"
          />
          <div className="counsel-meta">
            <small id="counsel-length">
              {Array.from(question).length}/50자 · 남은 자문 {view.remaining}/3
            </small>
            <button
              className="button"
              disabled={busy || pending || !question.trim()}
            >
              {busy ? "물음을 올리는 중…" : "자문 구하기"}
            </button>
          </div>
        </form>
      ) : view ? (
        <p>세 번의 자문을 모두 남겼구나. 이 이야기는 언제든 다시 펼쳐보거라.</p>
      ) : null}
      <ErrorBox error={error || loadError} />
    </section>
  );
}
