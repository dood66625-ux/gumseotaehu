// No customer input or provider error text is transmitted/displayed by this QA client.
const status = document.querySelector("#status");
const orderView = document.querySelector("#order");
const loadButton = document.querySelector("#load");
const payButton = document.querySelector("#pay");
let state,
  widgets,
  loading = false,
  paying = false;
function message(value) {
  status.textContent = value;
}
async function api(path, body) {
  const res = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || "서버 상태를 확인해주세요.");
  return result;
}
async function refresh() {
  state = await api("/state");
  orderView.textContent = `가상 주문: ${state.order.id}\n결제: ${state.order.payment}\n운명서: ${state.order.fulfillment}`;
  if (payButton && state.order.payment !== "pending") payButton.disabled = true;
  if (loadButton)
    loadButton.disabled =
      loading || !!widgets || state.order.payment !== "pending";
  return state;
}
async function loadSdk() {
  if (window.TossPayments) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.referrerPolicy = "no-referrer";
    const timer = setTimeout(() => {
      script.remove();
      reject(Error("SDK timeout"));
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(Error("SDK load"));
    };
    document.head.append(script);
  });
  if (!window.TossPayments) throw Error("SDK missing");
}
if (loadButton)
  loadButton.onclick = async () => {
    if (loading) return;
    loading = true;
    loadButton.disabled = true;
    try {
      await refresh();
      if (state.order.payment !== "pending") return;
      await loadSdk();
      widgets = window
        .TossPayments(state.clientKey)
        .widgets({ customerKey: "ANONYMOUS" });
      await widgets.setAmount({ currency: "KRW", value: state.amount });
      await widgets.renderPaymentMethods({
        selector: "#methods",
        variantKey: "DEFAULT",
      });
      await widgets.renderAgreement({
        selector: "#agreement",
        variantKey: "AGREEMENT",
      });
      payButton.disabled = !state.merchantConfigured;
      message(
        state.merchantConfigured
          ? "토스 테스트 결제수단을 불러왔습니다. 실제 청구는 없습니다."
          : "결제수단을 불러왔습니다. MID 설정 전에는 결제를 요청하지 않습니다.",
      );
    } catch {
      widgets = undefined;
      document.querySelector("#methods").replaceChildren();
      document.querySelector("#agreement").replaceChildren();
      message(
        "토스 테스트 결제수단을 불러오지 못했습니다. 키·결제 UI 등록·네트워크 설정을 확인해주세요.",
      );
      loadButton.disabled = false;
    } finally {
      loading = false;
    }
  };
if (payButton)
  payButton.onclick = async () => {
    if (!widgets || paying || !state.merchantConfigured) return;
    paying = true;
    payButton.disabled = true;
    try {
      await refresh();
      if (state.order.payment !== "pending") return;
      await widgets.requestPayment({
        orderId: state.order.id,
        orderName: "금서태후 가상 운명서 테스트",
        successUrl: location.origin + "/success",
        failUrl: location.origin + "/fail",
      });
    } catch {
      message(
        "결제창이 닫혔거나 요청이 완료되지 않았습니다. 먼저 같은 주문의 상태를 확인하세요.",
      );
    } finally {
      paying = false;
      await refresh().catch(() => {});
      payButton.disabled = true;
    }
  };
document.querySelector("#recover").onclick = async () => {
  try {
    await api("/recover", {});
    await refresh();
    message("서버에 저장된 결제키로 상태를 확인했습니다.");
  } catch (e) {
    message(e.message);
  }
};
const loginForm = document.querySelector("#login");
if (loginForm)
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const password = document.querySelector("#password"),
      code = document.querySelector("#code");
    try {
      await api("/login", { password: password.value, code: code.value });
      document.querySelector("#refund").disabled = false;
      message("관리자 인증이 완료되었습니다.");
    } catch (e) {
      message(e.message);
    } finally {
      password.value = "";
      code.value = "";
    }
  };
const refundButton = document.querySelector("#refund");
if (refundButton)
  refundButton.onclick = async () => {
    const button = document.querySelector("#refund");
    button.disabled = true;
    try {
      const result = await api("/refund", {});
      await refresh();
      message(
        result.state === "refunded"
          ? "전액 취소 상태를 확인했습니다."
          : "취소 상태를 확인 중입니다. 추가 취소 요청 없이 상태 재조회를 이용하세요.",
      );
    } catch (e) {
      message(e.message);
    } finally {
      button.disabled = false;
    }
  };
async function start() {
  const path = location.pathname,
    params = new URLSearchParams(location.search);
  // Remove callback credentials before any SDK resource is loaded. Never echo provider messages.
  if (path === "/success" || path === "/fail")
    history.replaceState(null, "", path);
  await refresh();
  if (path === "/fail") {
    message(
      "토스 테스트 인증이 취소되었거나 실패했습니다. 같은 주문을 다시 확인해주세요.",
    );
    return;
  }
  if (path === "/success") {
    if (params.size === 0) {
      message(
        "저장된 주문 상태를 표시했습니다. 추가 결제 없이 상태 재조회를 이용하세요.",
      );
      return;
    }
    const exactly = (name) => params.getAll(name).length === 1;
    if (
      !["orderId", "paymentKey", "amount"].every(exactly) ||
      params.get("orderId") !== state.order.id ||
      params.get("amount") !== String(state.amount) ||
      !params.get("paymentKey") ||
      params.get("paymentKey").length > 200
    ) {
      message("콜백 주문·금액 정보가 일치하지 않습니다. 승인하지 않았습니다.");
      return;
    }
    message("서버에서 결제를 확인하고 있습니다. 새 결제를 요청하지 마세요.");
    const result = await api("/confirm", {
      orderId: state.order.id,
      paymentKey: params.get("paymentKey"),
      amount: state.amount,
    });
    await refresh();
    message(
      result.state === "verified"
        ? "테스트 결제가 확인되었습니다."
        : "결제 확인 상태: " + result.state,
    );
  } else message("가상 주문이 준비되었습니다. 결제수단 불러오기를 눌러주세요.");
}
start().catch((e) => message(e.message));
