export default function ReportTypeImage({
  index,
  name,
  assetBase = "",
}: {
  index: number;
  name: string;
  assetBase?: string;
}) {
  return (
    <div
      className="type-art"
      role="img"
      aria-label={name + "을 상징하는 창작 인물"}
      style={{
        backgroundImage: `url(${assetBase}/report-types.webp)`,
        backgroundPosition: `${(index % 5) * 25}% ${index < 5 ? 0 : 100}%`,
      }}
    />
  );
}
