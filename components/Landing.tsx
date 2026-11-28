import DiscountCheckoutLabel from "./DiscountCheckoutLabel";
import type { ReactNode } from "react";
import { chapterArt } from "../lib/report-art";
import {
  PRODUCT_PRICE_TEXT,
  REPORT_WEB_PAGE_COUNT,
  REPORT_WEB_PAGE_NOTE,
} from "../lib/product";
import Intro from "@/components/Intro";
import MobilePrologue from "./MobilePrologue";
export default function Landing({
  extra,
  reviewHref,
}: { extra?: ReactNode; reviewHref?: string } = {}) {
  return (
    <div className="landing-stage">
      <MobilePrologue />
      <section className="hero" aria-label="금서태후의 금서를 펼치다">
        <div className="hero-portrait">
          <picture>
            <source
              media="(min-width:901px)"
              srcSet="/empress-royal-distant.webp"
            />
            <source media="(max-width:600px)" srcSet="/empress-royal-v2.webp" />
            <img
              src="/empress-royal-v2.webp"
              width="1200"
              height="1500"
              alt="봉황 관과 자주색 비단 예복을 입고 오래된 금서를 든 금서태후의 창작 초상"
              fetchPriority="high"
              loading="eager"
            />
          </picture>
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="imperial-script" aria-hidden="true">
          禁書太后 <span>封印之書</span>
        </div>
        <div className="hero-content">
          <p className="eyebrow">THE SEALED ARCHIVE · 禁書</p>
          <p className="hero-pre">오직 그대를 위해, 봉인을 풀다</p>
          <h1>
            그대의 <em>운명</em>을<br />
            펼쳐보겠느냐.
          </h1>
          <p className="hero-copy">
            태어난 순간에 새겨진 기운.
            <br />그 오래된 이야기를, 이제 그대에게.
          </p>
          <div className="landing-cta-stack">
            <a className="button hero-cta" href="/start">
              <span>내 사주 펼쳐보기</span>
              <span className="cta-arrow" aria-hidden="true">
                →
              </span>
            </a>
            {reviewHref && (
              <a className="button secondary hero-review-cta" href={reviewHref}>
                토스 테스트 결제 <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
          <Intro />
        </div>
        <div className="hero-bottom">
          <span>
            一人一書 <i /> 한 사람을 위한 한 권
          </span>
          <div className="landing-links">
            <a href="/legal/business">사업자 정보</a>
            <a href="/legal/privacy">개인정보</a>
            <a href="/legal/terms">약관</a>
          </div>
        </div>
      </section>
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
      <details id="landing-more" className="landing-more">
        <summary>
          금서 더 살펴보기 <span aria-hidden="true">＋</span>
        </summary>
        <div className="promise-strip">
          <span>
            <i aria-hidden="true">壹</i> 전통 명리학의 계산
          </span>
          <span>
            <i aria-hidden="true">貳</i> {PRODUCT_PRICE_TEXT}원 한 번의 결제
          </span>
          <span>
            <i aria-hidden="true">參</i> 1년 무료 재열람
          </span>
        </div>
        <section id="the-archive" className="section archive-intro">
          <div className="section-flourish" aria-hidden="true">
            禁
          </div>
          <p className="eyebrow">A STORY THAT BEGINS WITH YOU</p>
          <h2>
            같은 하늘 아래 태어나도,
            <br />
            같은 운명을 품지는 않으니.
          </h2>
          <p className="lead muted">
            사주팔자에 담긴 기질, 삶에서 마주하는 인연과 선택.
            <br />
            금서태후는 오래된 명리의 언어로
            <br className="mobile-br" /> 그대의 이야기를 읽습니다.
          </p>
          <p className="archive-aside">
            미래를 단정하는 예언이 아닌,
            <br />
            나를 이해하고 선택을 돌아보는 한 권의 기록.
          </p>
          <div className="grid three">
            <article className="feature">
              <div className="feature-orbit" aria-hidden="true">
                <span>木</span>
              </div>
              <span className="chapter-number">第一章 · THE SELF</span>
              <h3>타고난 기운의 결</h3>
              <p>
                사주팔자와 오행으로 살피는
                <br />
                그대의 기질과 가능성.
              </p>
            </article>
            <article className="feature">
              <div className="feature-orbit second" aria-hidden="true">
                <span>緣</span>
              </div>
              <span className="chapter-number">第二章 · THE CONNECTION</span>
              <h3>삶을 잇는 인연</h3>
              <p>
                재물과 관계, 사랑과 일.
                <br />
                그대의 일상을 이루는 이야기.
              </p>
            </article>
            <article className="feature">
              <div className="feature-orbit third" aria-hidden="true">
                <span>時</span>
              </div>
              <span className="chapter-number">第三章 · THE FLOW</span>
              <h3>시간이 남기는 흐름</h3>
              <p>
                대운과 연간·월별 흐름으로
                <br />
                앞으로의 선택을 차분하게.
              </p>
            </article>
          </div>
        </section>
        <section
          className="illustrated-archive"
          aria-labelledby="illustrated-archive-title"
        >
          <div className="archive-gallery-heading">
            <div>
              <p className="eyebrow">ONE BOOK, YOUR PERSONAL STORY</p>
              <h2 id="illustrated-archive-title">
                읽는 순간도,
                <br />
                간직하는 시간도 아름답게.
              </h2>
            </div>
            <p>
              나를 이해하는 {REPORT_WEB_PAGE_COUNT}페이지의 이야기.
              <br />
              그림을 따라 천천히 읽어 보거라. 쉬운 말로 그대의 마음에 남겨
              주겠노라.
            </p>
          </div>
          <div className="archive-gallery">
            {[0, 3, 7].map((index) => (
              <figure key={index}>
                <img
                  src={chapterArt[index].src}
                  alt={chapterArt[index].alt}
                  width="508"
                  height="337"
                  loading="lazy"
                />
                <figcaption>
                  <span>0{index + 1}</span>
                  {chapterArt[index].title}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="gallery-note">
            공통 일러스트 미리보기 · 그림은 각 장의 주제를 표현한 상징
            이미지입니다.
          </p>
        </section>
        <section className="empress-quote">
          <span className="quote-mark" aria-hidden="true">
            “
          </span>
          <p>
            운명은 그대를 가두는 답이 아니니라.
            <br />
            그대 안에 잠든 가능성을
            <br className="mobile-br" /> 읽어내는 것이지.
          </p>
          <span className="signature">
            금서태후 <i>禁書太后</i>
          </span>
        </section>
        <section className="book-section">
          <div className="book-scene" aria-hidden="true">
            <div className="book-halo" />
            <div className="book-art">
              <div className="book-spine" />
              <div className="book-frame" />
              <span>
                禁<br />書
              </span>
              <small>금서태후의 종합 운명서</small>
              <i>一人一書</i>
            </div>
            <div className="book-shadow" />
          </div>
          <div className="book-copy">
            <p className="eyebrow">A PRIVATE ARCHIVE OF YOUR OWN</p>
            <h2>
              {REPORT_WEB_PAGE_COUNT}페이지에 담긴 이야기.
              <br />
              오직 그대를 위한 운명서.
            </h2>
            <p className="muted">
              지금의 나를 이해하는 첫 장에서
              <br />
              다가올 시간의 흐름을 읽는 마지막 장까지.
            </p>
            <ol className="book-chapters">
              <li>
                <span>01—02</span> 사주 구조 · 타고난 성향
              </li>
              <li>
                <span>03—04</span> 재물과 선택 · 연애와 인연
              </li>
              <li>
                <span>05—06</span> 직업과 성장 · 관계와 균형
              </li>
              <li>
                <span>07—09</span> 대운 · 2027년 흐름 · 종합 조언
              </li>
            </ol>
            <div className="book-price">
              <strong>
                {PRODUCT_PRICE_TEXT}
                <span>원</span>
              </strong>
              <p>
                단 한 번의 결제
                <br />
                자동 구독·추가 과금 없음
              </p>
            </div>
            <a
              className="button"
              href="/start"
              aria-description="정상가 44,000원에서 할인된 금액입니다."
            >
              <DiscountCheckoutLabel />
            </a>
            <p className="fine">
              웹 전체 열람 · 그림이 담긴 PDF · 쉬운 풀이 · 1년 무료 재열람
              <br />
              {REPORT_WEB_PAGE_NOTE}
              <br />
              출생시간 미상·대운 계산 구분 미선택 시 관련 분석은 제한됩니다.
            </p>
          </div>
        </section>
        {extra}
      </details>
    </div>
  );
}
