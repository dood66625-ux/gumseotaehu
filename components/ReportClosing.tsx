import { reportClosing } from "../lib/report-closing";
import ReadingDetails from "./ReadingDetails";
import { readingExcerpt } from "../lib/reading-excerpt";
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
        <ReadingDetails
          title={ending.summaryTitle}
          brief={
            <>
              <p>{ending.yearLead}</p>
              {ending.points.map((point, i) => (
                <section key={point.title}>
                  <h3>
                    {i + 1}. {point.title}
                  </h3>
                  <p>{readingExcerpt(point.text, 80)}</p>
                </section>
              ))}
            </>
          }
        >
          <p>{ending.yearLead}</p>
          {ending.points.map((point, i) => (
            <section key={point.title}>
              <h3>
                {i + 1}. {point.title}
              </h3>
              <p>{point.text}</p>
            </section>
          ))}
        </ReadingDetails>
      </section>
      <section className="card" aria-label={ending.letterTitle}>
        <h2>{ending.letterTitle}</h2>
        <p className="quote">{ending.salutation}</p>
        <ReadingDetails
          title={ending.letterTitle}
          brief={
            <>
              <p>{ending.paragraphs[0]}</p>
              <p>{readingExcerpt(ending.paragraphs[1], 100)}</p>
              <p className="quote">{ending.signature}</p>
            </>
          }
        >
          {ending.paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
          <p className="quote">{ending.signature}</p>
        </ReadingDetails>
      </section>
    </>
  );
}
