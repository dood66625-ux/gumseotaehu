import { reportTop3 } from "../lib/report-extras";
export default function ReportTop3({ element }: { element: unknown }) {
  const data = reportTop3(element);
  if (!data) return null;
  return (
    <>
      {[
        ["나와 맞는 직업 TOP3", data.jobs],
        ["나와 잘 맞는 사람 유형 TOP3", data.people],
      ].map(([title, items]) => (
        <section className="card" key={title as string}>
          <h2>{title as string}</h2>
          {(items as typeof data.jobs).map((item, i) => (
            <section key={item.title}>
              <h3>
                {i + 1}. {item.title}
              </h3>
              <p>{item.text}</p>
            </section>
          ))}
        </section>
      ))}
      <p className="fine">{data.note}</p>
    </>
  );
}
