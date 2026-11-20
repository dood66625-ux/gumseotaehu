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
        <a href="/" className="brand">
          <span className="seal" aria-hidden="true">
            禁
          </span>
          <span>
            금서태후<small>禁 書 太 后</small>
          </span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="/recover" className="recover-link">
            <span aria-hidden="true">書</span> 내 운명서 찾기
          </a>
          <a href="/help">이용 안내</a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              금서태후 <span>禁書太后</span>
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
          <a href="/legal/refund">환불 및 취소 규정</a>
          <a href="/legal/business">사업자 정보</a>
          <a href="/legal/content">콘텐츠 안내</a>
          <a href="/help">구매·환불 요청</a>
          <a href="/admin">관리자</a>
        </div>
        <p className="fine">
          {livePayments ? "사업자" : "운영 예정 사업자"}: {business.name} ·
          대표자 {business.representative}
          <br />
          사업자등록번호 {business.registrationNumber}
          <br />
          사업장 주소: {business.address}
          <br />
          연락 이메일: <a href={`mailto:${business.email}`}>{business.email}</a>
        </p>
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
