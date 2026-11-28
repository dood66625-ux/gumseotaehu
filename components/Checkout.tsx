"use client";
import {
  PRODUCT_PRICE_TEXT,
  PRODUCT_REGULAR_PRICE_TEXT,
  REPORT_WEB_PAGE_COUNT,
} from "../lib/product";
import Link from "next/link";
import { openLiveWidget, type LiveWidget } from "../lib/toss-widget-client";
import { useEffect, useRef, useState } from "react";
import { api, useLoad, Loading, EmailAuth, ErrorBox } from "./client";
export default function Checkout({
  id,
  testReviewHref,
}: {
  id: string;
  testReviewHref?: string;
}) {
  const [allConsents, setAllConsents] = useState(false);
  const review = testReviewHref === "https://pay.gumseo.kr/";
  const {
    data: r,
    error: loadError,
    load: reloadReading,
  } = useLoad<any>("readings/" + id);
  const [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [scenario, setScenario] = useState("success");
  const [mode, setMode] = useState<"mock" | "live" | null>(
    review ? "mock" : null,
  );
  const [liveOrder, setLiveOrder] = useState<{
    id: string;
    orderName: string;
  } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const widget = useRef<LiveWidget | null>(null),
    locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (review) return;
    let active = true;
    api("payments/config")
      .then((value) => {
        if (!["mock", "live"].includes(value.mode)) throw Error();
        if (active) setMode(value.mode);
      })
      .catch(() => {
        if (active)
          setError(
            "결제 정보를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.",
          );
      });
    return () => {
      active = false;
    };
  }, [review]);
  useEffect(() => {
    api("session")
      .then((s) => setVerified(s.authenticated))
      .catch(() =>
        setError("인증 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요."),
      );
  }, []);
  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked.current || !mode || submitted) return;
    locked.current = true;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (testReviewHref === "https://pay.gumseo.kr/") {
        window.location.assign(testReviewHref);
        return;
      }
      if (mode === "live" && liveOrder && widget.current) {
        await widget.current.requestPayment({
          orderId: liveOrder.id,
          orderName: liveOrder.orderName,
          successUrl: location.origin + "/checkout/success",
          failUrl:
            location.origin +
            "/checkout/fail?orderId=" +
            encodeURIComponent(liveOrder.id),
        });
        setSubmitted(true);
        return;
      }
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
      if (!active.current) return;
      const status = await api("orders/" + order.id);
      if (!active.current) return;
      if (status.payment !== "pending") {
        window.location.href = "/checkout/success?orderId=" + order.id;
        return;
      }
      if (mode === "live") {
        const info = await api("payments/prepare-live", { orderId: order.id });
        if (
          info.mode !== "live" ||
          info.orderId !== order.id ||
          info.currency !== "KRW"
        )
          throw Error("결제 정보를 확인하지 못했습니다.");
        if (!active.current) return;
        setLiveOrder({ id: order.id, orderName: info.orderName });
        widget.current = await openLiveWidget(
          info,
          (value) => {
            if (active.current) setAgreed(value);
          },
          {
            methods: "#live-payment-methods-" + id,
            agreement: "#live-payment-agreement-" + id,
          },
        );
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
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? String(e.code)
          : "";
      const message = e instanceof Error ? e.message : "";
      const agreementNeeded =
        /AGREE|TERMS/.test(code) || /약관.*동의|동의.*약관/.test(message);
      const cardDetailNeeded = code === "NEED_CARD_PAYMENT_DETAIL";
      setError(
        cardDetailNeeded
          ? "카드사를 선택한 뒤 다시 눌러주세요."
          : agreementNeeded
            ? "토스 결제창의 필수 약관에 동의한 뒤 다시 눌러주세요."
            : mode === "live"
              ? "결제를 완료하지 못했습니다. 같은 주문으로 다시 확인해주세요."
              : message,
      );
      if (agreementNeeded)
        document
          .getElementById("live-payment-agreement-" + id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (cardDetailNeeded)
        document
          .getElementById("live-payment-methods-" + id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (loadError)
    return (
      <div className="card">
        <ErrorBox error={loadError} />
        <button className="button secondary" onClick={reloadReading}>
          출생정보 다시 확인
        </button>
      </div>
    );
  if (!r) return <Loading />;
  if (
    r.purchaseEligible === false ||
    r.input.age === "14-18" ||
    r.input.age === "under14"
  )
    return (
      <div className="notice">
        만 19세 이상 구매자만 결제를 이용할 수 있습니다.
      </div>
    );
  return (
    <section className="checkout-flow">
      <p className="checkout-eyebrow">한 권의 운명서</p>
      <h1>그대의 금서를 간직하거라.</h1>
      <section className="card gold checkout-product">
        <div className="checkout-product-summary">
          <h2>
            종합 운명서
            <span className="checkout-page-count">
              {REPORT_WEB_PAGE_COUNT}페이지 구성
            </span>
          </h2>
          <p className="price sale-price">
            <del className="regular-price" aria-label="정상가 44,000원">
              {PRODUCT_REGULAR_PRICE_TEXT}원
            </del>
            {PRODUCT_PRICE_TEXT}원
          </p>
        </div>
        <p>{r.chart.target}년 흐름 · 웹·PDF · 1년 재열람 · 구독 없음</p>
        <p className="hint">
          핵심 풀이 9개 주제와 부가 풀이·자문·전체보기 포함 · 웹 화면 기준
        </p>
        <p className="hint">
          {mode === "live"
            ? "최종 결제총액 · 일시불 · 카드 확인 후 작성"
            : "현재 체험은 실제 금액을 청구하지 않습니다."}
        </p>
      </section>
      <section className="checkout-birth">
        <h2>출생정보 확인</h2>
        <p>
          {r.input.name} · {r.input.date} ·{" "}
          {r.input.calendar === "solar" ? "양력" : "음력"}
          {r.input.leap ? " 윤달" : ""} ·{" "}
          {r.input.time || "시간 미상 · 시주/대운 제한"} · 한국
        </p>
        <Link href="/start">수정하기 ↗</Link>
      </section>
      <ErrorBox error={!review && !verified ? error : ""} />
      <div>
        {review ? (
          <p className="notice">
            심사용 가상 주문입니다. 이메일 인증 없이 토스 테스트 카드 결제창을
            확인할 수 있습니다. 실제 청구는 없습니다.
          </p>
        ) : !verified ? (
          <EmailAuth purpose="purchase" onVerified={() => setVerified(true)} />
        ) : (
          <p className="success">구매 이메일 인증이 완료되었습니다.</p>
        )}
      </div>
      <form
        onSubmit={pay}
        onInvalidCapture={(event) => {
          const details = (event.target as HTMLElement).closest("details");
          if (details) details.open = true;
        }}
        onChangeCapture={(event) => {
          const form = event.currentTarget;
          const target = event.target as EventTarget;
          if (!(target instanceof HTMLInputElement)) return;
          if (
            [
              "buyerAdult",
              "confirmedBirth",
              "terms",
              "privacy",
              "withdrawal",
            ].includes(target.name)
          )
            setAllConsents(
              [...form.querySelectorAll<HTMLInputElement>("input[required]")]
                .filter((input) =>
                  [
                    "buyerAdult",
                    "confirmedBirth",
                    "terms",
                    "privacy",
                    "withdrawal",
                  ].includes(input.name),
                )
                .every((input) => input.checked),
            );
        }}
      >
        <section className="checkout-agreements">
          <div className="card checkout-consents" hidden={review || !verified}>
            {!review && (
              <>
                <label className="check consent-all">
                  <input
                    type="checkbox"
                    checked={allConsents}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      event.currentTarget.form
                        ?.querySelectorAll<HTMLInputElement>("input[required]")
                        .forEach((input) => {
                          if (
                            [
                              "buyerAdult",
                              "confirmedBirth",
                              "terms",
                              "privacy",
                              "withdrawal",
                            ].includes(input.name)
                          )
                            input.checked = checked;
                        });
                      setAllConsents(checked);
                    }}
                  />
                  <span>
                    필수 사항 모두 동의{" "}
                    <small>필수 5개 항목 · 선택 동의 제외</small>
                  </span>
                </label>
                <details className="checkout-consent-details">
                  <summary>필수 5개·선택 1개 항목 자세히 보기</summary>
                  <div className="notice">
                    제공 개시 후 법정 요건을 충족하면 청약철회가 제한될 수
                    있습니다. 중복결제·오류·미제공·계약 불일치 및 미성년 계약
                    취소 등 법정 권리는 보장합니다.
                    <br />
                    <Link href="/legal/refund">
                      환불 및 취소 규정 전체 보기 ↗
                    </Link>
                  </div>
                  <p className="hint">
                    무료 미리보기를 제공했습니다. 금서태후는 창작 캐릭터이며 AI
                    해석은 미래 예측·전문 조언을 대신하지 않습니다.
                    {mode !== "live" &&
                      " 현재는 실제 AI를 호출하지 않는 규칙 기반 검증판입니다."}
                    {mode === "live" &&
                      " 결제 후 계산된 사주 정보를 OpenAI(미국)에 보내 운명서를 작성하고, 구매 이메일과 인증·안내 내용은 Resend(미국)를 통해 발송합니다. OpenAI에는 이름·이메일·원본 생년월일을 보내지 않습니다. 개인정보 안내에서 전송 항목과 거부 시 이용 제한을 확인해주세요."}
                  </p>

                  <div data-consent-page="4">
                    <label className="check">
                      <input name="buyerAdult" type="checkbox" required />
                      <span>
                        구매자 본인은 만 19세 이상입니다. (필수)
                        <small className="hint" style={{ display: "block" }}>
                          만 14~18세는 보호자 확인 절차가 준비되기 전까지 무료
                          풀이만 이용할 수 있습니다.
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
                  </div>
                  <div data-consent-page="5">
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
                      미리보기와 청약철회·환불 고지를 확인하고, 결제 확인 후
                      콘텐츠 작성을 요청합니다. 법정 권리는 유지됩니다. (필수)
                    </label>
                    <label className="check">
                      <input name="marketing" type="checkbox" />
                      혜택·소식 수신에 동의합니다. (선택 · 현재 발송하지 않음)
                    </label>
                  </div>
                  {mode === "mock" && !testReviewHref && (
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
                          <option value="close">
                            화면을 닫은 뒤 다시 찾기
                          </option>
                        </select>
                      </div>
                    </details>
                  )}
                </details>
              </>
            )}
          </div>
          <div className="card checkout-payment" hidden={!review && !verified}>
            {mode === "live" && (
              <section aria-label="카드 결제 수단">
                <div id={"live-payment-methods-" + id} />
                <div id={"live-payment-agreement-" + id} />
                {liveOrder && widget.current && (
                  <p className="hint" role="status">
                    {agreed
                      ? "카드 결제 약관을 확인했습니다."
                      : "카드사와 필수 약관을 확인한 뒤 아래 카드 결제 버튼을 눌러주세요."}
                  </p>
                )}

                {!liveOrder && (
                  <p className="hint">
                    아래 버튼을 누르면 카드 결제 수단을 선택할 수 있습니다.
                  </p>
                )}
              </section>
            )}
            {submitted && liveOrder && (
              <Link
                className="button secondary"
                href={"/checkout/success?orderId=" + liveOrder.id}
              >
                같은 주문 결제 상태 확인
              </Link>
            )}
            <ErrorBox error={error} />
            {review ? (
              <a
                className="button"
                style={{ width: "100%" }}
                href="https://pay.gumseo.kr/"
              >
                운명서 펼치기 · 토스 테스트 결제
              </a>
            ) : (
              <>
                <button
                  className="button"
                  style={{ width: "100%" }}
                  disabled={busy || submitted || !verified || !mode}
                >
                  {busy
                    ? "주문 확인 중…"
                    : mode === "live"
                      ? liveOrder && widget.current
                        ? `${PRODUCT_PRICE_TEXT}원 할인 결제하기`
                        : "카드 결제 수단 선택"
                      : testReviewHref
                        ? "운명서 펼치기 · 토스 테스트 결제"
                        : "운명서 펼치기 · 체험 결제"}
                </button>
              </>
            )}
          </div>
        </section>
      </form>
      <nav className="birth-policy-links">
        <a href="/legal/refund">환불 규정</a>
        <a href="/legal/business">사업자 정보</a>
      </nav>
    </section>
  );
}
