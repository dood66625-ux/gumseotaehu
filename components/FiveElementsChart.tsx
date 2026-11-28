const elements = [
  {
    key: "목",
    symbol: "木",
    color: "#91bba0",
    icon: "M0 9V-5M0 1C-13 1-11-12 0-9C11-12 13 1 0 1",
  },
  {
    key: "화",
    symbol: "火",
    color: "#df9b82",
    icon: "M0-12C4-4 12-1 8 7C3 15-9 11-9 3C-9-2-4-4-4-8C-3-2 2 0 0-12Z",
  },
  {
    key: "토",
    symbol: "土",
    color: "#dfbd79",
    icon: "M-13 9L-3-9L3 1L7-4L14 9ZM-3-9L-1-1L-5-2",
  },
  {
    key: "금",
    symbol: "金",
    color: "#eee0bd",
    icon: "M-12-4L-5-11H5L12-4L0 12ZM-12-4H12M-5-11L0 12L5-11",
  },
  {
    key: "수",
    symbol: "水",
    color: "#93b8d8",
    icon: "M-14-4Q-7-11 0-4T14-4M-14 3Q-7-4 0 3T14 3M-10 10Q-5 5 0 10T10 10",
  },
];
const point = (index: number, radius: number) => {
  const angle = ((-90 + index * 72) * Math.PI) / 180;
  return [240 + Math.cos(angle) * radius, 113 + Math.sin(angle) * radius];
};
const polygon = (radii: number[]) =>
  radii.map((radius, i) => point(i, radius).join(",")).join(" ");
const labels = [
  [240, 20],
  [386, 82],
  [354, 174],
  [126, 174],
  [94, 82],
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
  const leaders = elements.filter((_, i) => values[i] === maximum);
  return (
    <div
      className="five-elements-chart"
      role="img"
      aria-label={
        "오행 글자 수: " +
        elements.map((item, i) => `${item.key} ${values[i]}개`).join(", ")
      }
    >
      <svg viewBox="0 0 480 220" className="elements-sigil" aria-hidden="true">
        <circle cx="240" cy="113" r="88" className="sigil-orbit" />
        <circle cx="240" cy="113" r="82" className="sigil-orbit inner" />
        {[20, 40, 60, 78].map((radius) => (
          <polygon
            key={radius}
            points={polygon(elements.map(() => radius))}
            className="sigil-grid"
          />
        ))}
        {elements.map((item, i) => {
          const [x, y] = point(i, 78);
          return (
            <path
              key={item.key}
              d={`M240 113L${x} ${y}`}
              className="sigil-grid"
            />
          );
        })}
        <polygon
          points={polygon(values.map((v) => (v / maximum) * 78))}
          className="sigil-aura"
        />
        <polygon
          points={polygon(values.map((v) => (v / maximum) * 78))}
          className="sigil-shape"
        />
        {elements.map((item, i) => {
          const [x, y] = point(i, (values[i] / maximum) * 78);
          const [lx, ly] = labels[i];
          return (
            <g
              key={item.key}
              className={
                values[i] === maximum
                  ? "sigil-element dominant"
                  : "sigil-element"
              }
              style={{ color: item.color, animationDelay: `${i * 100}ms` }}
            >
              <circle cx={x} cy={y} r="3" className="sigil-point" />
              <g transform={`translate(${lx - 31} ${ly + 6})`}>
                <circle r="19" className="sigil-medallion" />
                <path d={item.icon} className="sigil-icon" />
              </g>
              <text x={lx - 3} y={ly + 2} className="sigil-name">
                {item.symbol}
                <tspan dx="6">{item.key}</tspan>
              </text>
              <text
                x={i === 0 ? lx + 42 : lx - 3}
                y={i === 0 ? ly + 2 : ly + 23}
                className="five-elements-count"
              >
                {values[i]}
                <tspan dx="3" className="sigil-unit">
                  개
                </tspan>
              </text>
            </g>
          );
        })}
        <circle cx="240" cy="113" r="3" className="sigil-center" />
        <text x="240" y="215" textAnchor="middle" className="sigil-caption">
          {leaders.length === 5
            ? "다섯 기운이 고르게 자리하였구나"
            : leaders.map((x) => x.key).join("·") + "의 기운이 두드러지는구나"}
        </text>
      </svg>
    </div>
  );
}
