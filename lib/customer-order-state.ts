/** Display guidance only. Server ownership/payment/expiry checks remain authoritative. */
type Order = {
  payment?: unknown;
  fulfillment?: unknown;
  deleted?: unknown;
  expires?: unknown;
};
const copy = {
  ready: {
    label: "열람 가능",
    heading: "그대의 운명서가\n열렸느니라.",
    description: "그대의 이야기를 천천히 펼쳐보거라.",
  },
  pending: {
    label: "결제 확인 대기",
    heading: "결제 상태를 확인하고 있습니다.",
    description:
      "승인 여부를 확인하고 있습니다. 추가 결제하지 말고 저장된 주문을 다시 확인해주세요.",
  },
  working: {
    label: "운명서 작성 중",
    heading: "운명서를 작성하고 있습니다.",
    description: "창을 닫아도 서버의 작성 작업은 계속됩니다.",
  },
  failed: {
    label: "작성 복구 필요",
    heading: "운명서 복구 확인이 필요합니다.",
    description:
      "작성에 실패했습니다. 추가 결제 없이 복구 또는 환불 검토를 요청할 수 있습니다.",
  },
  refund_pending: {
    label: "취소 확인 중",
    heading: "취소 처리 상태를 확인하고 있습니다.",
    description:
      "취소가 확인될 때까지 이 주문의 열람은 중단됩니다. 추가 결제나 취소 요청을 반복하지 마세요.",
  },
  refunded: {
    label: "전액 취소 완료",
    heading: "전액 취소가 완료되었습니다.",
    description:
      "이 주문의 웹 운명서 열람과 PDF 재다운로드 권한은 종료됐습니다. 이미 저장한 파일을 원격 삭제하지 않습니다.",
  },
  deleted: {
    label: "원문 삭제 완료",
    heading: "운명서 원문이 삭제되었습니다.",
    description:
      "고객 요청 또는 보관기간 종료에 따라 원문이 삭제돼 다시 열람하거나 내려받을 수 없습니다.",
  },
  expired: {
    label: "열람기한 종료",
    heading: "무료 재열람 기간이 종료되었습니다.",
    description:
      "이 주문의 열람기한이 지났습니다. 추가 결제 전에 구매·열람 문의로 확인해주세요.",
  },
  unknown: {
    label: "주문 확인 필요",
    heading: "주문 상태 확인이 필요합니다.",
    description:
      "열람 가능한 주문 상태를 확인하지 못했습니다. 추가 결제하지 말고 주문번호로 문의해주세요.",
  },
} as const;
export function customerOrderState(order: Order, now = Date.now()) {
  const validExpiry =
    typeof order.expires === "number" &&
    Number.isFinite(order.expires) &&
    order.expires > 0;
  const permitted =
    order.payment === "paid" &&
    !order.deleted &&
    validExpiry &&
    (order.expires as number) > now;
  let state: keyof typeof copy;
  if (order.payment === "refunded") state = "refunded";
  else if (order.deleted) state = "deleted";
  else if (order.payment === "refund_pending") state = "refund_pending";
  else if (
    order.payment === "paid" &&
    validExpiry &&
    (order.expires as number) <= now
  )
    state = "expired";
  else if (order.payment === "pending") state = "pending";
  else if (permitted && order.fulfillment === "ready") state = "ready";
  else if (permitted && order.fulfillment === "failed") state = "failed";
  else if (
    permitted &&
    [
      "waiting",
      "queued",
      "generating",
      "running",
      "working",
      "retrying",
    ].includes(String(order.fulfillment))
  )
    state = "working";
  else state = "unknown";
  return {
    state,
    ...copy[state],
    canRead: state === "ready",
    canChangeEmail: permitted,
    terminal: ["refunded", "deleted", "expired"].includes(state),
  };
}
