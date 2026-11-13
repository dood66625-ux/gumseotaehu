import type { ReactNode } from "react";
export default function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip">
        본문으로 건너뛰기
      </a>
      <div className="test-banner" role="region" aria-label="체험 서비스 안내">
        <span>체험판</span> 가상 정보로 둘러보기 · 실제 결제 없음
      </div>
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
          <a href="/help">고객센터</a>
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
          <a href="/legal/refund">환불·정정 정책</a>
          <a href="/legal/business">사업자 정보</a>
          <a href="/help">문의</a>
          <a href="/admin">관리자</a>
        </div>
        <p className="fine">
          금서태후는 창작 캐릭터이며, 초상은 AI로 제작한 창작 이미지입니다.
          <br />
          전통 명리학 해석은 미래의 사건을 확정하지 않으며 전문 조언을 대신하지
          않습니다.
          <br />
          현재는 가상 정보·규칙 기반 콘텐츠를 사용하는 체험판으로 실제 구매·AI
          호출·이메일 발송은 없습니다. 운영 서비스는 별도 검증·승인 후
          제공됩니다.
        </p>
        <div className="footer-bottom">
          <span>© 2026 GEUMSEO TAEHOU. ALL RIGHTS RESERVED.</span>
          <span>一人一書 · 한 사람을 위한 한 권</span>
        </div>
      </footer>
    </>
  );
}
