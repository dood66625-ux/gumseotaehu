import type { ReactNode } from "react";
export default function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip">
        본문으로 건너뛰기
      </a>
      <div className="test-banner" role="region" aria-label="검증 환경 안내">
        로컬 검증판 · 실제 결제·AI 호출·이메일 발송 없음
      </div>
      <header className="header">
        <a href="/" aria-label="禁 금서태후 禁書太后 홈" className="brand">
          <span className="seal">禁</span>
          <span>
            금서태후<small>禁書太后</small>
          </span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="/recover">내 운명서 찾기</a>
          <a href="/help">고객센터</a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div className="footer-brand">
          금서태후 <span>禁書太后</span>
        </div>
        <p>나를 이해하는 또 하나의 시선.</p>
        <div className="footer-links">
          <a href="/legal/terms">이용약관</a>
          <a href="/legal/privacy">개인정보 처리방침</a>
          <a href="/legal/refund">환불·정정 정책</a>
          <a href="/legal/business">사업자 정보</a>
          <a href="/help">문의</a>
          <a href="/admin">관리자</a>
        </div>
        <p className="fine">
          금서태후는 창작 캐릭터입니다. 전통 명리학 기반 해석은 미래를 확정하지
          않습니다.
          <br />
          정식 서비스는 AI 생성 콘텐츠를 제공합니다. 현재 검증판은 규칙 기반
          모의 콘텐츠입니다.
          <br />
          사업자·법무·계산 정확성 검토 전 출시 불가 · © 2026 금서태후
        </p>
      </footer>
    </>
  );
}
