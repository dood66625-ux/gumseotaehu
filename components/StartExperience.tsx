import Journey from "./Journey";
import StartForm from "./StartForm";
export default function StartExperience() {
  return (
    <section className="start-experience">
      <Journey step={1} />
      <p className="eyebrow">THE FIRST PAGE · 生</p>
      <h1>그대의 이야기를 들려주거라.</h1>
      <p className="page-intro">
        태어난 날과 시간, 그 작은 시작에 담긴 기운을 읽습니다.
        <br />
        실명 대신 그대가 편한 이름으로 시작해도 좋습니다.
      </p>
      <StartForm />
      <nav className="birth-policy-links" aria-label="이용 정책">
        <a href="/legal/privacy">개인정보</a>
        <a href="/legal/terms">약관</a>
        <a href="/legal/business">사업자 정보</a>
      </nav>
    </section>
  );
}
