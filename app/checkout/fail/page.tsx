import Link from "next/link";
export default function Page() {
  return (
    <div className="page">
      <h1>결제를 완료하지 못했습니다.</h1>
      <p>
        재결제 전 이메일 인증으로 기존 주문의 결제 상태를 확인하세요. 승인된
        주문은 추가 결제 없이 복구할 수 있습니다.
      </p>
      <div className="actions">
        <Link className="button" href="/recover">
          주문 상태 확인
        </Link>
        <Link className="button secondary" href="/help">
          고객센터
        </Link>
      </div>
    </div>
  );
}
