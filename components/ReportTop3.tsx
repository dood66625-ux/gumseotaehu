import { reportTop3 } from "../lib/report-extras";
export default function ReportTop3({ element }: { element: unknown }) {
  const data = reportTop3(element);
  if (!data) return null;
  return (
    <>
      {data.sections.map(({ title, items, note }) => (
        <section className="card" key={title}>
          <h2>{title}</h2>
          {items.map((item, i) => (
            <section key={item.title}>
              <h3>
                {i + 1}. {item.title}
              </h3>
              <p>{item.text}</p>
            </section>
          ))}
          <p className="fine">{note}</p>
        </section>
      ))}
    </>
  );
}
