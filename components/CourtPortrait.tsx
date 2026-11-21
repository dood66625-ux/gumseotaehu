"use client";
import { useState } from "react";
import { reportPortrait } from "../lib/report-portrait";
export default function CourtPortrait({ element }: { element: unknown }) {
  const [choice, setChoice] = useState<number | null>(null);
  const p = reportPortrait(element);
  if (!p) return null;
  return (
    <section className="card court-portrait" aria-label={p.title}>
      <p className="eyebrow">금서태후의 궁정 도감</p>
      <h2>{p.title}</h2>
      <p className="court-role">{p.role}</p>
      <p>{p.story}</p>
      <p>{p.traits.join(" · ")}</p>
      <h3>오늘 곁에 둘 색</h3>
      <div className="court-colors">
        {p.colors.map(([name, hex]) => (
          <span key={name}>
            <i style={{ background: hex }} aria-hidden="true" />
            {name}
          </span>
        ))}
      </div>
      <p>{p.item}</p>
      <p className="hint">{p.colorNote}</p>
      <h3>오늘은 어떤 한 걸음을 고르겠느냐?</h3>
      <div className="court-choices">
        {p.actions.map((action, i) => (
          <button
            key={action}
            type="button"
            aria-pressed={choice === i}
            onClick={() => setChoice(i)}
          >
            {action}
          </button>
        ))}
      </div>
      <p role="status">
        {choice === null
          ? "마음이 가는 카드 하나를 골라 보거라."
          : `좋다. 오늘은 ‘${p.actions[choice]}’부터 시작하거라.`}
      </p>
      <p className="hint">{p.note}</p>
    </section>
  );
}
