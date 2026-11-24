import { reportClosing } from "../lib/report-closing";
export default function ReportClosing({
  report,
  name,
}: {
  report: Parameters<typeof reportClosing>[0];
  name?: unknown;
}) {
  const ending = reportClosing(report, name);
  if (!ending) return null;
  return (
    <>
      <section className="card gold" aria-label={ending.summaryTitle}>
        <p className="eyebrow">{ending.yearLabel}</p>
        <h2>{ending.summaryTitle}</h2>
        <p>{ending.yearLead}</p>
        {ending.points.map((point, i) => (
          <section key={point.title}>
            <h3>
              {i + 1}. {point.title}
            </h3>
            <p>{point.text}</p>
          </section>
        ))}
      </section>
      <section className="card" aria-label={ending.letterTitle}>
        <h2>{ending.letterTitle}</h2>
        <p className="quote">{ending.salutation}</p>
        {ending.paragraphs.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
        <p className="quote">{ending.signature}</p>
      </section>
    </>
  );
}
