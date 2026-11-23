"use client";
import { useState } from "react";
import { reportFocusTopics } from "../lib/report-focus";
import { chapterTitles } from "../lib/report-titles";
export default function ReportFocus() {
  const [selected, setSelected] = useState<string | null>(null);
  const topic = reportFocusTopics.find((item) => item.key === selected);
  return (
    <section className="report-focus" aria-label="지금 고민에 맞춰 읽기">
      <h2>지금, 무엇이 궁금하느냐?</h2>
      <p className="hint">마음에 걸린 주제부터 펼쳐 보거라.</p>
      <div className="report-focus-buttons">
        {reportFocusTopics.map((item) => (
          <button
            type="button"
            className="button secondary"
            key={item.key}
            aria-pressed={selected === item.key}
            onClick={() => {
              setSelected(item.key);
              const chapter = document.getElementById(
                "chapter-" + item.chapters[0],
              );
              if (chapter) {
                chapter.tabIndex = -1;
                chapter.focus({ preventScroll: true });
                chapter.scrollIntoView({ block: "start", behavior: "auto" });
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {topic && (
        <nav aria-label="고민과 관련된 장">
          {topic.chapters.map((index) => (
            <a key={index} href={"#chapter-" + index}>
              {chapterTitles[index]}
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
