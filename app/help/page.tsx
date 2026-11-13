import Link from "next/link";
import Help from "@/components/Help";
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">WE KEEP YOUR STORY SAFE</p>
      <h1>그대의 문의를 듣겠습니다.</h1>
      <p className="page-intro">
        창을 닫았거나 PDF를 잊으셨나요?{" "}
        <Link href="/recover">운명서 다시 찾기</Link>로 무료 재열람할 수
        있습니다.
      </p>
      <details>
        <summary>출생정보를 잘못 입력했어요.</summary>
        <p>
          구매 전에는 다시 입력할 수 있습니다. 구매 후 7일 이내 1회 정정 혜택은
          정책 초안이며, 본인 확인 후 운영자가 버전 이력을 남겨 재제공합니다.
          시스템 오류 등 법정 권리는 이 제한과 별개입니다.
        </p>
      </details>
      <details>
        <summary>환불이 가능한가요?</summary>
        <p>
          이중결제, 시스템 오류, 콘텐츠 미제공, 설명과 다른 상품, 고객 변심 등
          사유별로 검토합니다. 결제 즉시 일률적으로 환불을 거절하지 않습니다.{" "}
          <Link href="/legal/refund">환불 정책 보기</Link>
        </p>
      </details>
      <Help />
    </div>
  );
}
