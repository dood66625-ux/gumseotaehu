"use client";
import { reportPortrait } from "../lib/report-portrait";
export default function CourtPortrait({ element }: { element: unknown }) {
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
      <p className="hint">{p.note}</p>
    </section>
  );
}
