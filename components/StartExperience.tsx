import StartForm from "./StartForm";
export default function StartExperience() {
  return (
    <section className="start-experience">
      <StartForm />
      <nav className="birth-policy-links" aria-label="이용 정책">
        <a href="/legal/privacy">개인정보</a>
        <a href="/legal/terms">약관</a>
        <a href="/legal/business">사업자 정보</a>
      </nav>
    </section>
  );
}
