/** Static fallback: the start link works even when JavaScript is disabled. */
export default function Intro() {
  return (
    <div className="intro">
      <span className="intro-dot" />
      <span id="intro-copy">봉인된 한 권의 책, 그대의 이야기가 깨어난다</span>
      <a className="text-button" href="/start">
        스토리 건너뛰기 ↗
      </a>
    </div>
  );
}
