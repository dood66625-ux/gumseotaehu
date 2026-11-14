import Link from "next/link";
export default function SupportGuide() {
  return (
    <section className="support-guide">
      <h2>먼저 확인해 주세요.</h2>
      <p className="hint">
        별도의 실시간 채팅·추가 사주 상담은 제공하지 않습니다. 구매·열람 문제는
        아래 안내로 먼저 확인하고, 해결되지 않은 결제·환불·개인정보 요청은
        웹으로 접수할 수 있습니다.
      </p>
      <details>
        <summary>창을 닫았거나 운명서를 다시 찾고 싶어요.</summary>
        <p>
          구매 후 1년 내에는 추가 결제 없이 이메일 인증으로 같은 운명서와 PDF를
          다시 받을 수 있습니다. <Link href="/recover">운명서 다시 찾기 →</Link>
        </p>
      </details>
      <details>
        <summary>결제 후 보고서가 보이지 않아요.</summary>
        <p>
          먼저 구매 이메일로 주문 상태를 확인하세요. 결제가 확인되었는데도
          콘텐츠를 받지 못했다면 아래 접수에서 복구 또는 환불 검토를 요청할 수
          있습니다.
        </p>
      </details>
      <details>
        <summary>출생정보를 잘못 입력했어요.</summary>
        <p>
          구매 전에는 수정할 수 있습니다. 구매 후에는 7일 이내 1회 정정 혜택
          정책안을 검토합니다. 시스템 오류와 법정 권리는 별도로 처리합니다.
        </p>
      </details>
      <details>
        <summary>환불이나 개인정보 삭제를 요청하고 싶어요.</summary>
        <p>
          이메일 인증 후 아래 양식에서 요청 유형을 선택하세요.{" "}
          <Link href="/legal/refund">환불·정정 정책</Link>과{" "}
          <Link href="/legal/privacy">개인정보 처리방침</Link>을 확인할 수
          있습니다.
        </p>
      </details>
    </section>
  );
}
