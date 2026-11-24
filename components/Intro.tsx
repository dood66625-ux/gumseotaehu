export default function Intro() {
  return (
    <div className="intro">
      <span className="intro-dot" aria-hidden="true" />
      <span id="intro-copy">금서의 봉인이, 그대를 기다립니다.</span>
      <button
        id="prologue-replay"
        className="story-replay"
        type="button"
        hidden
        aria-haspopup="dialog"
        aria-controls="mobile-prologue"
      >
        스토리 다시 보기 <span aria-hidden="true">↻</span>
      </button>
    </div>
  );
}
