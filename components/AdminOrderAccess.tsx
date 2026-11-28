const date = (value: number) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default function AdminOrderAccess({ access }: { access: any }) {
  if (!access) return <span>기록 확인 필요</span>;
  return (
    <div className="admin-order-access">
      <strong
        className={
          access.viewCount ? "access-read-confirmed" : "access-read-unconfirmed"
        }
      >
        {access.viewCount ? "화면 열람 확인" : "화면 열람 미확인"}
      </strong>
      {access.viewCount > 0 ? (
        <>
          <p>최근 30일 {access.viewCount}회</p>
          <p>첫 열람 {date(access.firstViewedAt)}</p>
          <p>마지막 {date(access.lastViewedAt)}</p>
        </>
      ) : (
        <p>
          {access.legacyResponseAt
            ? "과거 자료 응답 기록만 있음"
            : "열람 확인 기록 없음"}
        </p>
      )}
      <p>{access.availability}</p>
      {access.generationIssue && (
        <p className="access-issue">
          작성 오류/보류 · {access.generationIssue.code} · 시도{" "}
          {access.generationIssue.attempts}회
        </p>
      )}
      {access.errorCount > 0 && (
        <p className="access-issue">웹/PDF 오류 기록 {access.errorCount}건</p>
      )}
      {access.blockedCount > 0 && <p>접근 차단 {access.blockedCount}건</p>}
      {access.lastIssue && (
        <details>
          <summary>최근 오류·차단 확인</summary>
          <p>{date(access.lastIssue.created)}</p>
          <p>{access.lastIssue.code}</p>
        </details>
      )}
    </div>
  );
}
