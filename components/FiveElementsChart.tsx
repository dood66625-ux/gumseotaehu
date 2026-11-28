import type { CSSProperties } from "react";
const elements = [
  { key: "목", symbol: "木", color: "#87b69a" },
  { key: "화", symbol: "火", color: "#d58d79" },
  { key: "토", symbol: "土", color: "#d7b574" },
  { key: "금", symbol: "金", color: "#e5dac0" },
  { key: "수", symbol: "水", color: "#8eafcd" },
];
export default function FiveElementsChart({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const values = elements.map(({ key }) =>
    Math.max(0, Math.min(8, Number(counts[key]) || 0)),
  );
  const maximum = Math.max(1, ...values);
  return (
    <div
      className="five-elements-chart"
      role="img"
      aria-label={
        "오행 글자 수: " +
        elements
          .map((item, index) => `${item.key} ${values[index]}개`)
          .join(", ")
      }
    >
      {elements.map((item, index) => (
        <div
          className="five-elements-column"
          key={item.key}
          style={
            {
              "--element-color": item.color,
              "--element-fill": `${(values[index] / maximum) * 100}%`,
              "--element-delay": `${index * 75}ms`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <span className="five-elements-count">
            {values[index]}
            <small>개</small>
          </span>
          <div className="five-elements-track">
            <span className="five-elements-fill" />
          </div>
          <span className="five-elements-label">
            <b>{item.symbol}</b>
            {item.key}
          </span>
        </div>
      ))}
    </div>
  );
}
