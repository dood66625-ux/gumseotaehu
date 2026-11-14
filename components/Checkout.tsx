"use client";
import Link from "next/link";
import Journey from "./Journey";
import { useEffect, useState } from "react";
import { api, useLoad, Loading, EmailAuth, ErrorBox } from "./client";
export default function Checkout({ id }: { id: string }) {
  const { data: r, error: loadError } = useLoad<any>("readings/" + id);
  const [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [scenario, setScenario] = useState("success");
  useEffect(() => {
    api("session").then((s) => setVerified(s.authenticated));
  }, []);
  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const order = await api("orders", {
        readingId: id,
        consent: {
          terms: f.get("terms") === "on",
          privacy: f.get("privacy") === "on",
          withdrawal: f.get("withdrawal") === "on",
          confirmedBirth: f.get("confirmedBirth") === "on",
          buyerAdult: f.get("buyerAdult") === "on",
          marketing: f.get("marketing") === "on",
        },
      });
      const status = await api("orders/" + order.id);
      if (status.payment !== "pending") {
        window.location.href = "/checkout/success?orderId=" + order.id;
        return;
      }
      const p = await api("payments/authenticate", {
        orderId: order.id,
        scenario,
      });
      if (p.close) {
        window.location.href = "/recover";
        return;
      }
      await api("payments/confirm", {
        orderId: order.id,
        paymentKey: p.paymentKey,
        amount: p.amount,
      });
      window.location.href = "/checkout/success?orderId=" + order.id;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loadError) return <ErrorBox error={loadError} />;
  if (!r) return <Loading />;
  if (
    r.purchaseEligible === false ||
    r.input.age === "14-18" ||
    r.input.age === "under14"
  )
    return (
      <div className="notice">
        만 19세 이상 구매자만 모의 결제를 이용할 수 있습니다.
      </div>
    );
  return (
    <>
      <Journey step={3} />
      <p className="eyebrow">BEFORE THE SEAL IS BROKEN · 封</p>
      <h1>
        그대만의 한 권을
        <br />
        간직할 시간.
      </h1>
      <div className="card">
        <h2>출생정보 최종 확인</h2>
        <dl className="data-list">
          <div>
            <dt>별명</dt>
            <dd>{r.input.name}</dd>
          </div>
          <div>
            <dt>출생일</dt>
            <dd>
              {r.input.date} · {r.input.calendar === "solar" ? "양력" : "음력"}
              {r.input.leap ? " · 윤달" : ""}
            </dd>
          </div>
          <div>
            <dt>출생시간</dt>
            <dd>{r.input.time || "미상 · 시주/대운 제한"}</dd>
          </div>
          <div>
            <dt>출생지역</dt>
            <dd>대한민국 · KST</dd>
          </div>
        </dl>
        <p className="hint">출생정보가 다르면 계산과 해석도 달라집니다.</p>
        <Link className="text-button" href="/start">
          입력정보 수정하기 ↗
        </Link>
      </div>
      {!verified ? (
        <EmailAuth onVerified={() => setVerified(true)} />
      ) : (
        <p className="success">구매 이메일 인증이 완료되었습니다.</p>
      )}
      <form onSubmit={pay}>
        <section className="card gold">
          <div className="checkout-book-tag" aria-hidden="true">
            禁書
          </div>
          <h2>금서태후의 종합 운명서</h2>
          <p>
            9개 장 · {r.chart.target}년 연간·월별 흐름 포함
            <br />웹 전체 열람 + PDF 다운로드
            <br />
            구매일로부터 1년 무료 재열람
          </p>
          <p className="price">
            33,000원 <small>최종 결제총액 · 일시불</small>
          </p>
          <p className="hint">
            자동 구독이나 추가 과금은 없습니다. 정식 서비스는 결제 확인 후
            운명서 작성을 시작하며, 현재 체험에서는 실제 금액을 청구하지
            않습니다.
          </p>
        </section>
        <section className="card">
          <h2>구매 전 안내와 동의</h2>
          <div className="notice">
            디지털콘텐츠의 제공 개시 후 청약철회 제한이 적용될 수 있지만, 법정
            요건 충족 여부를 개별 판단합니다. 이중결제·시스템 오류·콘텐츠
            미제공·계약 불일치 등 법정 권리는 보장됩니다. 미성년자 계약 취소권도
            배제하지 않습니다.
            <br />
            <Link href="/legal/refund">상황별 환불·정정 정책 전체 보기 ↗</Link>
          </div>
          <p className="hint">
            무료 미리보기를 제공했습니다. 금서태후는 창작 캐릭터이며 AI 기반
            해석은 미래 예측이나 전문 조언을 대신하지 않습니다. 현재는 실제 AI를
            호출하지 않는 규칙 기반 검증판입니다.
          </p>
          <label className="check">
            <input name="buyerAdult" type="checkbox" required />
            <span>
              구매자 본인은 만 19세 이상입니다. (필수)
              <small className="hint" style={{ display: "block" }}>
                만 14~18세는 보호자 확인 절차가 준비되기 전까지 무료 풀이만
                이용할 수 있습니다.
              </small>
            </span>
          </label>
          <label className="check">
            <input name="confirmedBirth" type="checkbox" required />
            출생정보와 시간 미상 시 해석 한계를 확인했습니다. (필수)
          </label>
          <label className="check">
            <input name="terms" type="checkbox" required />
            <span>
              <Link href="/legal/terms" target="_blank">
                이용약관
              </Link>
              과 상품 구성·가격·1년 열람기간을 확인했습니다. (필수)
            </span>
          </label>
          <label className="check">
            <input name="privacy" type="checkbox" required />
            <span>
              <Link href="/legal/privacy" target="_blank">
                주문 이행을 위한 개인정보 처리
              </Link>
              에 동의합니다. (필수)
            </span>
          </label>
          <label className="check">
            <input name="withdrawal" type="checkbox" required />
            미리보기와 청약철회·환불 고지를 확인하고, 결제 확인 후 콘텐츠 작성을
            요청합니다. 법정 권리는 유지됩니다. (필수)
          </label>
          <label className="check">
            <input name="marketing" type="checkbox" />
            혜택·소식 수신에 동의합니다. (선택 · 현재 발송하지 않음)
          </label>
          <details className="report-disclosure">
            <summary>다른 체험 결제 상황 살펴보기</summary>{" "}
            <div className="field">
              <label htmlFor="scenario">체험 결제 옵션</label>
              <select
                id="scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="success">정상 체험</option>
                <option value="decline">결제 거절</option>
                <option value="close">화면을 닫은 뒤 다시 찾기</option>
              </select>
            </div>
          </details>
          <ErrorBox error={error} />
          <button
            className="button"
            style={{ width: "100%" }}
            disabled={busy || !verified}
          >
            {busy ? "주문 확인 중…" : "운명서 펼치기 · 체험 결제"}
          </button>
        </section>
      </form>
    </>
  );
}
