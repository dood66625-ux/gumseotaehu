import Link from "next/link";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const id = (await searchParams).orderId;
  const ownedLink =
    id &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
      ? "/checkout/success?orderId=" + encodeURIComponent(id)
      : "/recover";
  return (
    <div className="page">
      <h1>결제를 완료하지 못했습니다.</h1>
      <p>
        재결제 전 이메일 인증으로 기존 주문의 결제 상태를 확인하세요. 승인된
        주문은 추가 결제 없이 복구할 수 있습니다.
      </p>
      <div className="actions">
        <Link className="button" href={ownedLink}>
          주문 상태 확인
        </Link>
      </div>
    </div>
  );
}
