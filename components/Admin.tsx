"use client";
import { useEffect, useState } from "react";
import { api, ErrorBox, Loading } from "./client";
export default function Admin() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [oid, setOid] = useState(""),
    [action, setAction] = useState("resend");
  async function load() {
    try {
      setData(await api("admin"));
    } catch {
      setData(null);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("admin/login", {
        password: f.get("password"),
        code: f.get("code"),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const body: any = { orderId: oid, reason: f.get("reason") };
      if (action === "correct") body.input = JSON.parse(String(f.get("input")));
      if (action === "delete") body.ticketId = f.get("ticketId");
      if (action === "refund") body.testFailure = f.get("failure") === "on";
      await api("admin/" + action, body);
      setMessage("처리가 기록되었습니다. 모의 PG/메일 상태를 확인하세요.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="page">
        <p className="eyebrow">RESTRICTED OPERATIONS</p>
        <h1>운영자 인증</h1>
        <p className="notice">
          로컬 운영자 전용입니다. 생성된 비밀번호는 .env.local에서, 현재 1회용
          코드는 터미널의 npm run admin:code로 확인하세요. 운영용 계정·MFA 등록
          및 복구 체계는 출시 전 별도 구축이 필요합니다.
        </p>
        <form className="card" onSubmit={login}>
          <div className="field">
            <label htmlFor="admin-password">운영자 비밀번호</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-code">1회용 인증코드</label>
            <input
              id="admin-code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </div>
          <ErrorBox error={error} />
          <button className="button" disabled={busy}>
            관리자 로그인
          </button>
        </form>
      </div>
    );
  return (
    <div className="page wide">
      <p className="eyebrow">GEUMSEO OPERATIONS · LOCAL MOCK</p>
      <h1>운영 현황</h1>
      <p className="notice">
        표시된 금액은 로컬 모의 원장 기준입니다. 실제 매출이 아니며 광고
        플랫폼에는 전송하지 않습니다. 실 API 사용량·PG 수수료·광고비는 계정 연결
        전 측정할 수 없습니다.
      </p>
      <div className="metric-grid">
        <div className="metric">
          <small>모의 승인 총액</small>
          <b>{data.metrics.gross.toLocaleString()}원</b>
        </div>
        <div className="metric">
          <small>모의 환불</small>
          <b>{data.metrics.refunds.toLocaleString()}원</b>
        </div>
        <div className="metric">
          <small>모의 순매출</small>
          <b>
            {(data.metrics.gross - data.metrics.refunds).toLocaleString()}원
          </b>
        </div>
        <div className="metric">
          <small>실 AI 호출 비용</small>
          <b>0원</b>
        </div>
      </div>
      <div className="actions">
        <button className="button secondary" onClick={load}>
          새로고침
        </button>
        <a className="button secondary" href="/api/admin/export">
          비식별 주문 CSV
        </a>
        <button
          className="button secondary"
          onClick={async () => {
            await api("logout", {});
            setData(null);
          }}
        >
          로그아웃
        </button>
      </div>
      <h2>주문·결제·보고서</h2>
      <div className="field">
        <label htmlFor="order-search">주문번호 검색</label>
        <input
          id="order-search"
          placeholder="주문번호 일부"
          onChange={(e) => setMessage("search:" + e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>주문번호</th>
              <th>이메일 HMAC</th>
              <th>금액</th>
              <th>결제</th>
              <th>제공</th>
              <th>열람기한</th>
              <th>선택</th>
            </tr>
          </thead>
          <tbody>
            {data.orders
              .filter(
                (o: any) =>
                  !message.startsWith("search:") ||
                  o.id.includes(message.slice(7)),
              )
              .map((o: any) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.email}</td>
                  <td>{o.amount.toLocaleString()}원</td>
                  <td>{o.payment}</td>
                  <td>{o.fulfillment}</td>
                  <td>
                    {o.expires
                      ? new Date(o.expires).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td>
                    <button className="small" onClick={() => setOid(o.id)}>
                      업무 선택
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!data.orders.length && (
        <p className="muted">
          주문이 없습니다. 고객 여정으로 모의 주문을 만들어 주세요.
        </p>
      )}
      <form className="card" onSubmit={act}>
        <h2>선택 주문 업무</h2>
        <div className="field">
          <label htmlFor="action-order">주문번호</label>
          <input
            id="action-order"
            value={oid}
            onChange={(e) => setOid(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="action">처리 종류</label>
          <select
            id="action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="resend">재열람 이메일 로컬 재발송</option>
            <option value="retry">실패한 보고서 생성 재시도</option>
            <option value="refund">모의 전액 환불</option>
            <option value="correct">본인확인 후 출생정보 1회 정정</option>
            <option value="delete">개인정보 삭제 · 거래기록 분리 보존</option>
          </select>
        </div>
        {["refund", "correct", "delete"].includes(action) && (
          <>
            <div className="field">
              <label htmlFor="reason">검토 근거·본인확인·처리 사유</label>
              <textarea
                id="reason"
                name="reason"
                minLength={5}
                maxLength={1000}
                required
              />
            </div>
            <label className="check">
              <input type="checkbox" required />
              대상 주문, 본인확인 및 법정 소비자 권리를 검토했습니다.
            </label>
          </>
        )}
        {action === "refund" && (
          <label className="check">
            <input name="failure" type="checkbox" />
            PG 취소 실패를 시험합니다 · 완료로 표시하지 않음
          </label>
        )}
        {action === "correct" && (
          <div className="field">
            <label htmlFor="correct-json">
              정정 출생정보 JSON (본인 확인 완료 후)
            </label>
            <textarea
              id="correct-json"
              name="input"
              rows={10}
              required
              defaultValue={
                '{"name":"테스트","date":"1995-05-15","calendar":"solar","leap":false,"time":"10:30","sex":"female","place":"KR","age":"19+","self":true,"consent":true}'
              }
            />
            <p className="hint">
              원본 계산과 보고서는 버전 이력을 유지하며 새 스냅샷으로
              재발급합니다. 7일 이내 1회 혜택 정책안입니다.
            </p>
          </div>
        )}
        {action === "delete" && (
          <div className="field">
            <label htmlFor="delete-ticket">
              본인 인증된 개인정보 삭제 문의번호
            </label>
            <input id="delete-ticket" name="ticketId" required />
          </div>
        )}
        <ErrorBox error={error} />
        {message && !message.startsWith("search:") && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <button
          className={
            "button " +
            (action === "refund" || action === "delete"
              ? "danger"
              : "secondary")
          }
          disabled={busy}
        >
          선택 업무 실행
        </button>
      </form>
      <h2>고객 문의</h2>
      {data.tickets.map((t: any) => (
        <Ticket key={t.id} t={t} reload={load} />
      ))}
      <h2>작업·환불·감사 기록</h2>
      <div className="card">
        <h3>작성 작업</h3>
        {data.jobs.map((j: any) => (
          <p className="hint" key={j.id}>
            {j.order_id} · {j.state} · 시도 {j.attempts} ·{" "}
            {j.error || "오류 없음"}
          </p>
        ))}
        <h3>환불</h3>
        {data.refunds.map((r: any) => (
          <p className="hint" key={r.id}>
            {r.order_id} · {r.amount}원 · {r.status}
          </p>
        ))}
        <h3>내부 퍼널 · 개인 식별정보 없음</h3>
        {data.events.map((e: any) => (
          <p className="hint" key={e.event}>
            {e.event}: {e.count}
          </p>
        ))}
        <p className="hint">
          로컬 메일 기록 {data.mailCount}건 · 외부 발송 0건
        </p>
        <details>
          <summary>감사로그 최근 100건</summary>
          {data.audit.map((a: any) => (
            <p className="fine" key={a.id}>
              {new Date(a.created).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              · {a.action} · {a.target}
            </p>
          ))}
        </details>
      </div>
    </div>
  );
}
function Ticket({ t, reload }: { t: any; reload: () => void }) {
  const [answer, setAnswer] = useState(""),
    [error, setError] = useState("");
  return (
    <article className="card">
      <span className="status">
        {t.status} · {t.category}
      </span>
      <p className="hint">
        문의 {t.id}
        <br />
        주문 {t.orderId || "없음"} · 검토 기준일{" "}
        {new Date(t.due).toLocaleDateString("ko-KR")}
        {Date.now() > t.due && t.status === "open" ? " · 기한 검토 필요" : ""}
      </p>
      <p>{t.message}</p>
      {t.answer && <p className="notice">답변: {t.answer}</p>}
      <div className="field">
        <label htmlFor={"answer-" + t.id}>고객 답변</label>
        <textarea
          id={"answer-" + t.id}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={2000}
        />
      </div>
      <ErrorBox error={error} />
      <button
        className="small"
        onClick={async () => {
          try {
            await api("admin/answer", { ticketId: t.id, message: answer });
            setError("");
            reload();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        답변 저장·로컬 알림
      </button>
    </article>
  );
}
