import { readFileSync } from "node:fs";
const portrait =
  "data:image/svg+xml;base64," +
  readFileSync("public/empress.svg").toString("base64");
import Intro from "@/components/Intro";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">THE EMPRESS’S BOOK OF DESTINY</p>
          <p className="hero-pre">오래된 지혜가, 지금의 그대를 비추다</p>
          <h1>
            그대의 운명에는
            <br />
            <em>어떤 결</em>이<br className="mobile-br" /> 담겨 있느냐.
          </h1>
          <p className="hero-copy">
            태어난 순간의 기운에서 시작하는
            <br />
            오직 그대를 위한 한 권의 이야기.
          </p>
          <a className="button hero-cta" href="/start">
            내 사주 펼쳐보기 <span>↗</span>
          </a>
          <p className="cta-note">무료 풀이 먼저 · 회원가입 없이 시작</p>
          <Intro />
        </div>
        <div className="hero-portrait">
          <img
            src={portrait}
            width="640"
            height="800"
            alt="금빛 관과 자주색 황실 의복을 입고 운명서를 든 금서태후의 창작 일러스트"
            fetchPriority="high"
          />
          <div className="portrait-label">
            <span>禁書太后</span>
            <small>금지된 책을 지키는 이</small>
          </div>
          <span className="portrait-caption">
            ORIGINAL CHARACTER ILLUSTRATION
          </span>
        </div>
        <div className="hero-bottom">
          <span>한 사람의 기운, 한 권의 운명서</span>
          <span>아래로 펼쳐보기 ↓</span>
        </div>
      </section>
      <section className="promise-strip">
        <span>전통 명리학 기반 계산</span>
        <span>한 번의 결제, 33,000원</span>
        <span>구매 후 1년 무료 재열람</span>
      </section>
      <section className="section">
        <p className="eyebrow">A QUIET MOMENT FOR YOURSELF</p>
        <h2>
          미래를 단정하기보다,
          <br />
          그대를 더 깊이 이해하도록.
        </h2>
        <p className="muted lead">
          타고난 기질과 흐름을 읽고,
          <br />
          지금의 선택을 돌아볼 여백을 드립니다.
        </p>
        <div className="grid three">
          <article className="feature">
            <span className="chapter-number">壹 · 01</span>
            <h3>타고난 나의 결</h3>
            <p>
              사주팔자와 오행에서 살피는
              <br />
              그대만의 성향과 가능성.
            </p>
          </article>
          <article className="feature">
            <span className="chapter-number">貳 · 02</span>
            <h3>삶을 이루는 이야기</h3>
            <p>
              재물, 인연, 직업과 관계.
              <br />
              일상의 고민을 다른 시선으로.
            </p>
          </article>
          <article className="feature">
            <span className="chapter-number">參 · 03</span>
            <h3>시간이 남기는 흐름</h3>
            <p>
              대운과 연간·월별 흐름으로
              <br />
              앞으로의 계획을 차분하게.
            </p>
          </article>
        </div>
      </section>
      <section className="book-section">
        <div className="book-art" aria-hidden="true">
          <div className="book-spine" />
          <span>
            禁<br />書
          </span>
          <small>그대를 위한 운명서</small>
        </div>
        <div>
          <p className="eyebrow">ONE BOOK. YOUR STORY.</p>
          <h2>
            그대의 이야기는
            <br />
            언제든 다시 펼칠 수 있느니라.
          </h2>
          <p className="muted">
            웹으로 읽고, PDF로 간직하고.
            <br />
            창을 닫아도 구매 이메일 인증으로 다시 찾으세요.
          </p>
          <ul className="clean-list">
            <li>종합 운명서 9개 장 · 2027년 흐름 포함</li>
            <li>33,000원 일회성 · 자동 구독 없음</li>
            <li>구매일로부터 1년간 무료 재열람</li>
          </ul>
          <a className="button secondary" href="/start">
            무료 풀이부터 시작하기 ↗
          </a>
        </div>
      </section>
      <section className="section faq">
        <p className="eyebrow">BEFORE YOU BEGIN</p>
        <h2>궁금한 것을 먼저 살펴보거라.</h2>
        <details>
          <summary>무료로 어디까지 볼 수 있나요?</summary>
          <p>
            입력한 출생정보로 계산한 일간·오행과 두 가지 기초 풀이를 제공합니다.
            유료 결제 여부는 무료 풀이 후 결정할 수 있습니다.
          </p>
        </details>
        <details>
          <summary>출생시간을 몰라도 되나요?</summary>
          <p>
            시간 미상으로 입력할 수 있습니다. 시주와 대운 시작시각은 생성하지
            않으며, 해석 범위를 명확히 알려드립니다.
          </p>
        </details>
        <details>
          <summary>보고서를 잃어버리면 다시 결제해야 하나요?</summary>
          <p>
            구매 후 1년간 이메일 인증으로 같은 운명서를 다시 볼 수 있고 PDF도
            다시 내려받을 수 있습니다.
          </p>
        </details>
        <details>
          <summary>AI가 미래를 예측하나요?</summary>
          <p>
            전통 명리학의 계산과 AI 해석은 과학적으로 검증된 미래 예측이
            아닙니다. 선택의 참고자료로 이용해 주세요. 현재 로컬 검증판은 실제
            AI를 호출하지 않습니다.
          </p>
        </details>
      </section>
    </>
  );
}
