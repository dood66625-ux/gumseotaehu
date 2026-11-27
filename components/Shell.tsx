import type { ReactNode } from "react";
import { business } from "@/lib/business";
export default function Shell({
  children,
  livePayments = false,
}: {
  children: ReactNode;
  livePayments?: boolean;
}) {
  return (
    <>
      <script src="/usage.js" defer />
      <a href="#main" className="skip">
        본문으로 건너뛰기
      </a>
      {!livePayments && (
        <div
          className="test-banner"
          role="region"
          aria-label="체험 서비스 안내"
        >
          <span>체험판</span> 가상 정보로 둘러보기 · 실제 결제 없음
        </div>
      )}
      <header className="header">
        <a href="/" className="brand" aria-label="금서태후 홈">
          <img
            className="brand-logo"
            src="/brand/geumseo-logo-v1.webp"
            width="864"
            height="288"
            alt="금서태후 · 禁書太后"
            decoding="async"
          />
        </a>
        <nav aria-label="주요 메뉴">
          <a href="/recover" className="recover-link">
            <span aria-hidden="true">書</span> 내 운명서 찾기
          </a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              <img
                className="brand-logo"
                src="/brand/geumseo-logo-v1.webp"
                width="864"
                height="288"
                alt="금서태후 · 禁書太后"
                loading="lazy"
                decoding="async"
              />
            </div>
            <p>오래된 지혜, 오직 그대를 위한 이야기.</p>
          </div>
          <a className="footer-recover" href="/recover">
            간직한 운명서 다시 펼치기 <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="footer-links">
          <a href="/legal/terms">이용약관</a>
          <a href="/legal/privacy">개인정보 처리방침</a>
          <a href="/legal/refund">환불 정책</a>
          <a href="/legal/content">콘텐츠 안내</a>
        </div>
        <details className="footer-business">
          <summary>사업자 정보</summary>
          <p className="fine">
            {livePayments ? "사업자" : "운영 예정 사업자"}: {business.name} ·
            대표자 {business.representative}
            <br />
            사업자등록번호 {business.registrationNumber}
            <br />
            통신판매업 신고번호 {business.commerceRegistration}
            <br />
            호스팅서비스 제공자: {business.hostingProvider}
            <br />
            사업장 주소: {business.address}
            <br />
            연락 이메일:{" "}
            <a href={`mailto:${business.email}`}>{business.email}</a>
          </p>
          <a href="/legal/business">사업자 정보 자세히 보기</a>
        </details>
        <p className="fine">
          {!livePayments && (
            <>
              가상 정보로 둘러보는 체험판입니다. 실제 구매는 제공하지 않습니다.
              <br />
            </>
          )}
          풀이의 제공 방식과 해석 범위는{" "}
          <a href="/legal/content">콘텐츠 안내</a>에서 확인할 수 있습니다.
        </p>
        <div className="footer-bottom">
          <span>© 2026 GEUMSEO TAEHOU. ALL RIGHTS RESERVED.</span>
          <span>一人一書 · 한 사람을 위한 한 권</span>
        </div>
      </footer>
    </>
  );
}
