export default function Intro() {
  return (
    <div className="intro">
      <span className="intro-dot" aria-hidden="true" />
      <span id="intro-copy">금서의 봉인이, 그대를 기다립니다.</span>
      <a className="text-button" href="/start">
        스토리 건너뛰기 <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
