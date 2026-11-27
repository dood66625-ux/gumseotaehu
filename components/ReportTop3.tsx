import ReadableText from "./ReadableText";
import { reportTop3 } from "../lib/report-extras";
import ReadingDetails from "./ReadingDetails";
import { readingExcerpt } from "../lib/reading-excerpt";
export default function ReportTop3({ element }: { element: unknown }) {
  const data = reportTop3(element);
  if (!data) return null;
  return (
    <>
      {data.sections.map(({ title, lead, items, note }) => (
        <section className="card" key={title}>
          <h2>{title}</h2>
          <ReadingDetails
            title={title}
            brief={
              <>
                <p>{readingExcerpt(lead)}</p>
                {items.map((item, i) => (
                  <section key={item.title}>
                    <h3>
                      {i + 1}. {item.title}
                    </h3>
                    <p>{readingExcerpt(item.text, 1)}</p>
                  </section>
                ))}
              </>
            }
          >
            <ReadableText text={lead} />
            {items.map((item, i) => (
              <section key={item.title}>
                <h3>
                  {i + 1}. {item.title}
                </h3>
                <ReadableText text={item.text} />
              </section>
            ))}
            <p className="fine">{note}</p>
          </ReadingDetails>
        </section>
      ))}
    </>
  );
}
