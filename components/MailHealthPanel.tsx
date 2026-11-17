import type { mailQueueHealth } from "../lib/mail-health";
const descriptions: Record<string, string> = {
  MAIL_REVIEW_REQUIRED: "자동 처리를 멈춘 검토 대기 건이 있습니다.",
  MAIL_RESULT_UNCERTAIN: "발송 결과가 불명확한 메일이 있습니다.",
  MAIL_RESTORE_HELD: "복원 후 대조가 필요한 보류 메일이 있습니다.",
  MAIL_LEASE_EXPIRED: "발송 작업의 처리 기한이 지났습니다.",
  MAIL_QUEUE_OVERDUE: "15분 이상 처리되지 않은 발송 대기가 있습니다.",
  MAIL_DELIVERY_UNCONFIRMED:
    "첫 발송 시도 후 24시간 이상 전달을 확인하지 못했습니다.",
  MAIL_BLOCKED: "발송이 차단된 메일이 있습니다.",
  MAIL_STATE_UNRECOGNIZED:
    "알 수 없는 메일 상태가 있어 별도 확인이 필요합니다.",
};
export default function MailHealthPanel({
  health,
}: {
  health: ReturnType<typeof mailQueueHealth>;
}) {
  return (
    <section className="card" aria-labelledby="mail-health-title">
      <h2 id="mail-health-title">이메일 처리 점검</h2>
      <p className="hint">
        집계 시각:{" "}
        {new Date(health.checkedAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}{" "}
        · 화면을 다시 조회하면 갱신됩니다.
      </p>
      <p>
        {health.requiresAttention
          ? "검토가 필요한 상태가 있습니다."
          : "현재 정의된 큐 경고가 없습니다."}
      </p>
      <dl className="data-list">
        <div>
          <dt>전체 기록</dt>
          <dd>{health.total}건</dd>
        </div>
        <div>
          <dt>결과 불명확</dt>
          <dd>{health.counts.uncertain}건</dd>
        </div>
        <div>
          <dt>별도 검토</dt>
          <dd>{health.counts.review}건</dd>
        </div>
        <div>
          <dt>복원 후 보류</dt>
          <dd>{health.signals.recoveryHeld}건</dd>
        </div>
        <div>
          <dt>15분 이상 발송 대기</dt>
          <dd>{health.signals.overdueQueue}건</dd>
        </div>
        <div>
          <dt>24시간 이상 전달 미확인</dt>
          <dd>{health.signals.acceptedWithoutDelivery}건</dd>
        </div>
      </dl>
      {!!health.issues.length && (
        <ul aria-label="메일 검토 항목">
          {health.issues.map((issue) => (
            <li key={issue}>
              {descriptions[issue] ?? "메일 상태를 별도로 확인해주세요."}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        공급자 이력과 기존 접수 여부를 먼저 확인하세요. 결과 불명확·복원 보류
        건을 새 메일로 재발송하지 마세요.
      </p>
      <p className="hint">
        이 점검은 읽기 전용입니다. 경고가 없더라도 실제 발송 활성화나 수신
        성공을 뜻하지 않습니다. 공급자 접수·전달과 고객 열람·PDF 저장은 서로
        다릅니다.
      </p>
    </section>
  );
}
