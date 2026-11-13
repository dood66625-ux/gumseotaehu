export default function Journey({ step = 1 }: { step?: number }) {
  return (
    <ol className="reading-journey" aria-label="운명서를 여는 여정">
      {["태어난 순간", "기운의 해석", "한 권의 운명서"].map((label, i) => (
        <li
          key={label}
          className={
            step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
          }
          aria-current={step === i + 1 ? "step" : undefined}
        >
          <span>{String(i + 1).padStart(2, "0")}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
