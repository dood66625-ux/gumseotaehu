import { PRODUCT_PRICE_KRW, PRODUCT_PRICE_TEXT } from "../../lib/product";
import React from "react";
import { createRoot } from "react-dom/client";
import Shell from "../../components/Shell";
import StartExperience from "../../components/StartExperience";
import Preview from "../../components/Preview";
import Checkout from "../../components/Checkout";
import PaymentStatus from "../../components/PaymentStatus";
import ReportReader from "../../components/ReportReader";
import Recover from "../../components/Recover";
import Help from "../../components/Help";
import ContentGuide from "../../components/ContentGuide";
import BusinessInfo from "../../components/BusinessInfo";
import RefundPolicy from "../../components/RefundPolicy";
const snapshot = JSON.parse(
  document.getElementById("preview-data")!.textContent!,
);
const base = snapshot.previewBasePath ?? "/gumseotaehu",
  nativeFetch = window.fetch.bind(window);
const read = () =>
  JSON.parse(
    sessionStorage.getItem("geumseo-synthetic-preview-v1") ||
      '{"authenticated":false,"created":false,"paid":false,"tickets":[]}',
  );
const save = (v: any) =>
  sessionStorage.setItem("geumseo-synthetic-preview-v1", JSON.stringify(v));
const response = (v: any, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
(window as any).__GEUMSEO_PREVIEW_EMAIL = read().purchaseEmail;
window.fetch = async (input: any, init: any = {}) => {
  const path = typeof input === "string" ? input : new URL(input.url).pathname;
  if (!path.startsWith("/api/")) return nativeFetch(input, init);
  const p = path.slice(5),
    s = read();
  const b = init.body ? JSON.parse(String(init.body)) : {};
  if (p === "session")
    return response({
      authenticated: s.authenticated,
      admin: false,
      mode: "synthetic-browser-preview",
    });
  if (p === "logout") {
    s.authenticated = false;
    save(s);
    return response({ ok: true });
  }
  if (p === "readings" && init.method === "POST") {
    s.age = b.age;
    save(s);
    return response({ id: snapshot.reading.id }, 201);
  }
  if (p.startsWith("readings/"))
    return response({
      ...snapshot.reading,
      input: { ...snapshot.reading.input, age: s.age || "unconfirmed" },
    });
  if (p === "auth/request")
    return response({
      challengeId: "11111111-1111-4111-8111-111111111111",
      message: "가상 인증번호를 확인하세요.",
    });
  if (p.startsWith("local-mail/"))
    return response({
      code: "123456",
      body: "가상 예시 인증번호입니다. 실제 이메일을 보내지 않습니다.",
    });
  if (p === "auth/verify") {
    if (b.code !== "123456")
      return response({ error: "가상 인증번호 123456을 입력하세요." }, 400);
    s.authenticated = true;
    save(s);
    return response({ ok: true });
  }
  if (p === "orders" && init.method === "POST") {
    if (b.consent?.buyerAdult !== true)
      return response(
        { error: "구매자 본인이 만 19세 이상인지 확인해 주세요." },
        403,
      );
    if (!s.authenticated)
      return response({ error: "가상 이메일 인증이 필요합니다." }, 401);
    if (s.age === "14-18")
      return response(
        { error: "만 14~18세는 무료 풀이만 이용할 수 있습니다." },
        403,
      );
    s.created = true;
    save(s);
    return response({ id: snapshot.report.order.id }, 201);
  }
  if (p === "orders") {
    if (!s.authenticated)
      return response({ error: "가상 이메일 인증이 필요합니다." }, 401);
    return response(
      s.created
        ? [
            {
              ...snapshot.report.order,
              payment: s.paid ? "paid" : "pending",
              fulfillment: s.paid ? "ready" : "waiting",
            },
          ]
        : [],
    );
  }
  if (p.startsWith("orders/"))
    return response({
      ...snapshot.report.order,
      payment: s.paid ? "paid" : "pending",
      fulfillment: s.paid ? "ready" : "waiting",
    });
  if (p === "payments/authenticate") {
    if (b.scenario === "decline")
      return response(
        { error: "모의 결제가 거절되었습니다. 실제 청구는 없습니다." },
        400,
      );
    if (b.scenario === "close") {
      s.paid = true;
      save(s);
    }
    return response({
      paymentKey: "synthetic-no-real-payment",
      amount: PRODUCT_PRICE_KRW,
      close: b.scenario === "close",
    });
  }
  if (p === "payments/confirm") {
    if (
      !s.authenticated ||
      b.amount !== PRODUCT_PRICE_KRW ||
      b.orderId !== snapshot.report.order.id ||
      b.paymentKey !== "synthetic-no-real-payment"
    )
      return response({ error: "가상 주문의 결제금액을 확인해 주세요." }, 400);
    s.paid = true;
    save(s);
    return response({ ok: true });
  }
  if (p.startsWith("reports/")) {
    if (!s.authenticated || !s.paid)
      return response({ error: "가상 구매 흐름을 먼저 체험해 주세요." }, 403);
    if (p.endsWith("/pdf")) return nativeFetch(base + "/sample-report.pdf");
    return response(snapshot.report);
  }
  if (p === "resend")
    return response({
      message: "가상 재발송 체험을 완료했습니다. 실제 이메일 발송은 없습니다.",
    });
  if (p.startsWith("email-change/")) {
    if (!s.authenticated || !s.paid)
      return response({ error: "가상 구매 인증이 필요합니다." }, 401);
    if (p === "email-change/request")
      return response({ changeId: "33333333-3333-4333-8333-333333333333" });
    if (p === "email-change/local-code") return response({ code: "123456" });
    if (p === "email-change/confirm") {
      if (b.code !== "123456")
        return response({ error: "가상 인증번호를 확인하세요." }, 400);
      s.purchaseEmail = "preview-corrected@example.invalid";
      s.authenticated = false;
      save(s);
      return response({ ok: true });
    }
  }
  if (p === "tickets") {
    if (!s.authenticated)
      return response({ error: "가상 이메일 인증이 필요합니다." }, 401);
    if (init.method === "POST") {
      const t = {
        id: "22222222-2222-4222-8222-222222222222",
        category: b.category,
        orderId: b.orderId,
        status: "open",
        message: "가상 미리보기 문의입니다. 실제 상담 접수가 아닙니다.",
        created: Date.now(),
        due: Date.now() + 3 * 86400000,
      };
      s.tickets.push(t);
      save(s);
      return response({ id: t.id }, 201);
    }
    return response(s.tickets);
  }
  return response(
    {
      error:
        "이 기능은 별도 개발 서버에서 제공하며 정적 미리보기에는 포함되지 않습니다.",
    },
    403,
  );
};
const q = new URLSearchParams(location.search),
  screen = q.get("screen") || "home",
  id = q.get("id") || q.get("orderId") || snapshot.report.order.id;
if (screen !== "home") {
  document.getElementById("home")!.remove();
  const content =
    screen === "start" ? (
      <>
        <p className="notice">
          가상 인물 ‘가온’의 정보로 체험합니다. 실제 개인정보는 입력하지
          않습니다.
        </p>
        <StartExperience />
      </>
    ) : screen === "preview" ? (
      <Preview id={snapshot.reading.id} />
    ) : screen === "checkout" ? (
      <Checkout
        id={snapshot.reading.id}
        testReviewHref={snapshot.testReviewHref}
      />
    ) : screen === "success" ? (
      <PaymentStatus id={id} />
    ) : screen === "report" ? (
      <ReportReader id={id} assetBase={base} />
    ) : screen === "recover" ? (
      <>
        <h1>가상 운명서 다시 찾기</h1>
        <Recover />
      </>
    ) : screen === "refund" ? (
      <RefundPolicy />
    ) : screen === "content" ? (
      <ContentGuide />
    ) : screen === "business" ? (
      <>
        <h1>사업자 정보</h1>
        <BusinessInfo />
      </>
    ) : screen === "help" ? (
      <>
        <h1>구매·열람 이용 안내</h1>
        <p className="notice">
          문의 접수도 브라우저 안의 가상 체험입니다. 실제 상담은 접수되지
          않습니다.
        </p>
        <Help />
      </>
    ) : (
      <>
        <h1>{screen === "admin" ? "관리자 접근 제한" : "정책·서비스 안내"}</h1>
        <p className="notice">
          이 주소는 고정된 합성 데이터로 체험하는 정적 미리보기입니다. 실제
          AI·결제·메일·고객정보 처리가 없습니다. 관리자 업무와 실제 서버 기능은
          공개하지 않습니다.
        </p>
        <p>
          운영 서비스는 {PRODUCT_PRICE_TEXT}원 일회성 종합 운명서, 구매 후 1년
          재열람을 목표로 개발 중입니다. 법률·정확성·운영 검수가 완료되기 전
          실제 판매하지 않습니다.
        </p>
        <a
          className="button secondary"
          href="https://github.com/dood66625-ux/gumseotaehu/blob/main/docs/test-report.md"
        >
          구현·정책·검증 보고서 확인
        </a>
      </>
    );
  createRoot(document.getElementById("app")!).render(
    <Shell>
      <div className="page">{content}</div>
    </Shell>,
  );
}
