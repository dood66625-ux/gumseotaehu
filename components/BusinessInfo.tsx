import { business } from "@/lib/business";
export default function BusinessInfo() {
  return (
    <>
      <dl className="data-list">
        <div>
          <dt>상호</dt>
          <dd>{business.name}</dd>
        </div>
        <div>
          <dt>대표자</dt>
          <dd>{business.representative}</dd>
        </div>
        <div>
          <dt>사업자등록번호</dt>
          <dd>{business.registrationNumber}</dd>
        </div>
        <div>
          <dt>통신판매업 신고번호</dt>
          <dd>{business.commerceRegistration}</dd>
        </div>
        <div>
          <dt>사업장 주소</dt>
          <dd>{business.address}</dd>
        </div>
        <div>
          <dt>호스팅서비스 제공자</dt>
          <dd>{business.hostingProvider}</dd>
        </div>
        <div>
          <dt>개인정보보호 책임자</dt>
          <dd>{business.privacyOfficer}</dd>
        </div>
        <div>
          <dt>연락 이메일</dt>
          <dd>
            <a href={`mailto:${business.email}`}>{business.email}</a>
          </dd>
        </div>
      </dl>
      <section className="card">
        <h2>출시 전 추가 고지</h2>
        <p className="hint">
          통신판매업 신고번호는 운영자가 제공한 값입니다. 고객 문의는 이메일로
          접수합니다. 연락처의 필수 고지 요건과 개인정보 처리
          조건 등은 출시 전 추가 확인합니다. 실제 판매는 필요한 고지와 운영
          검토가 끝난 뒤 시작합니다.
        </p>
      </section>
      <section className="card">
        <h2>이용 안내와 요청 접수</h2>
        <p>
          FAQ와 이메일 인증 재열람을 우선 제공하고, 별도의 실시간 채팅·추가 사주
          상담은 제공하지 않습니다. 결제 오류·환불·정정·개인정보 요청은 웹 접수
          경로를 유지합니다.
        </p>
        <p className="hint">
          현재 공개 체험판에서는 실제 고객 요청이나 이메일을 접수·발송하지
          않습니다.
        </p>
      </section>
    </>
  );
}
