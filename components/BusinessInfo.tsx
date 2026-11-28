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
        <h2>이용 안내와 요청 접수</h2>
        <p>
          구매한 운명서는 구매 이메일 인증 후 다시 열람할 수 있습니다. 결제
          오류·환불·정정·개인정보 관련 요청은 문의 이메일로 접수해주세요. 구매
          이메일과 주문번호 또는 결제일을 함께 알려주시면 확인에 도움이 됩니다.
        </p>
      </section>
    </>
  );
}
