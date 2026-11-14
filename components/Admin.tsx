"use client";
import { useEffect, useState } from "react";
import { api, ErrorBox, Loading } from "./client";
export default function Admin() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [oid, setOid] = useState(""),
    [action, setAction] = useState("resend"),
    [query, setQuery] = useState(""),
    [correctCalendar, setCorrectCalendar] = useState("solar");
  async function load() {
    try {
      setData(await api("admin?query=" + encodeURIComponent(query)));
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
      if (action === "correct")
        body.input = {
          name: f.get("correctionName"),
          date: f.get("correctionDate"),
          calendar: correctCalendar,
          leap: correctCalendar === "lunar" && f.get("correctionLeap") === "on",
          time:
            f.get("correctionUnknown") === "on"
              ? null
              : f.get("correctionTime"),
          sex: f.get("correctionSex"),
          place: "KR",
          age: "19+",
          self: true,
          consent: true,
        };
      if (action === "delete") body.ticketId = f.get("ticketId");
      if (action === "refund") body.testFailure = f.get("failure") === "on";
      await api("admin/" + action, body);
      setMessage("처리가 기록되었습니다. 모의 PG/메일 상태를 확인하세요.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("로그인을 다시")) setData(null);
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
          최근 5,000건 가림 처리 주문 CSV
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
      <div className="actions">
        <button className="button secondary" onClick={() => setData(null)}>
          관리자 인증 갱신
        </button>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await api("admin/revoke-sessions", {});
              setData(null);
              setMessage("관리자 세션을 모두 종료했습니다.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          관리자 세션 전체 종료
        </button>
      </div>
      {data.health && (
        <section className="card">
          <h2>장애·복구 확인</h2>
          <p>
            작업자: {data.health.workerHealthy ? "정상 확인" : "연결 확인 필요"}
          </p>
          <p>
            생성 실패 {data.health.counts.failedJobs}건 · 환불 오류{" "}
            {data.health.counts.refundErrors}건 · 검토 기한 경과 문의{" "}
            {data.health.counts.overdueTickets}건
          </p>
          <p>
            승인 대사 대기 {data.health.counts.pendingApprovals}건 · 제공 완료
            원문 누락 {data.health.counts.missingReports}건
          </p>
          <p>
            제공 실패 주문 {data.health.counts.undeliverablePaid}건 · 테스트 PG
            확인 대기 {data.health.counts.tossUncertain}건 · 별도 검토{" "}
            {data.health.counts.tossReview}건
          </p>
          <p>
            메일 대기 {data.health.counts.mailQueued}건 · 확인 필요{" "}
            {data.health.counts.mailUncertain}건 · 반송/수신거부{" "}
            {data.health.counts.mailBounced}건
          </p>
          <p>
            공급자 접수 {data.health.counts.mailAccepted}건 · 수신 서버 전달
            확인 {data.health.counts.mailDelivered}건
          </p>
          <p className="hint">
            메일 접수·전달 확인은 고객의 열람이나 PDF 저장을 뜻하지 않습니다.
            현재는 실제 발송이 비활성화된 로컬 검증판입니다.
          </p>
          <p className="hint">
            제공한 원문이 누락되면 재생성보다 검증된 백업 복구를 우선합니다.
            새로 생성한 문서를 기존 원문과 같다고 표시하지 않습니다.
          </p>
        </section>
      )}
      <h2>주문·결제·보고서</h2>
      <p className="hint">
        최근 200건을 표시합니다. 이전 주문은 주문번호 앞부분으로 검색하세요.
      </p>
      <div className="field">
        <label htmlFor="order-search">주문번호 검색</label>
        <input
          id="order-search"
          placeholder="주문번호 일부"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <button className="button secondary" onClick={load}>
        주문 검색
      </button>
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
            {data.orders.map((o: any) => (
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
          <fieldset className="card">
            <legend>본인 확인 후 출생정보 정정</legend>
            <div className="field">
              <label htmlFor="correction-name">정정할 별명</label>
              <input
                id="correction-name"
                name="correctionName"
                maxLength={24}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="correction-date">정정할 생년월일</label>
              <input
                id="correction-date"
                name="correctionDate"
                placeholder="YYYY-MM-DD"
                pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="correction-calendar">정정 달력 기준</label>
              <select
                id="correction-calendar"
                value={correctCalendar}
                onChange={(e) => setCorrectCalendar(e.target.value)}
              >
                <option value="solar">양력</option>
                <option value="lunar">음력</option>
              </select>
            </div>
            {correctCalendar === "lunar" && (
              <label className="check">
                <input name="correctionLeap" type="checkbox" />
                윤달
              </label>
            )}
            <div className="field">
              <label htmlFor="correction-time">정정할 출생시간</label>
              <input
                id="correction-time"
                name="correctionTime"
                type="time"
                defaultValue="12:00"
              />
            </div>
            <label className="check">
              <input type="checkbox" name="correctionUnknown" />
              출생시간 미상
            </label>
            <div className="field">
              <label htmlFor="correction-sex">정정 대운 계산 구분</label>
              <select id="correction-sex" name="correctionSex">
                <option value="unspecified">선택하지 않음</option>
                <option value="female">여성</option>
                <option value="male">남성</option>
              </select>
            </div>
            <p className="hint">
              대상자 본인·성인 여부와 원본 주문을 확인한 후 적용합니다. 7일 이내
              1회 혜택 정책안이며, 법정 권리는 별도로 검토합니다.
            </p>
          </fieldset>
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
          로컬 메일 기록 {data.mailCount}건 · 실제 발송 비활성
        </p>
        <details>
          <summary>최근 메일 처리 기록 · 최대 50건</summary>
          {data.mailDeliveries?.map((m: any) => (
            <p className="fine" key={m.outbox_id}>
              {m.outbox_id} · {m.template} · {m.state} · 시도 {m.attempts} ·{" "}
              {m.last_error ?? "오류 없음"}
            </p>
          ))}
        </details>
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
