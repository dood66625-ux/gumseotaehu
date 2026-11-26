/** Browser SDK loader, invoked only after the server selects enrolled live checkout. */
type Agreement = {
  on: (
    event: string,
    handler: (value: { agreedRequiredTerms: boolean }) => void,
  ) => void;
  getAgreementStatus?: () =>
    | { agreedRequiredTerms: boolean }
    | Promise<{ agreedRequiredTerms: boolean }>;
};
export type LiveWidget = {
  setAmount: (amount: { currency: "KRW"; value: number }) => Promise<void>;
  renderPaymentMethods: (options: {
    selector: string;
    variantKey: string;
  }) => Promise<unknown>;
  renderAgreement: (options: {
    selector: string;
    variantKey: string;
  }) => Promise<Agreement>;
  requestPayment: (options: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }) => Promise<unknown>;
};
declare global {
  interface Window {
    TossPayments?: (key: string) => {
      widgets: (options: { customerKey: string }) => LiveWidget;
    };
  }
}
let loading: Promise<void> | undefined;
export async function openLiveWidget(
  info: { clientKey: string; amount: number },
  onAgreement: (value: boolean) => void,
  targets = {
    methods: "#live-payment-methods",
    agreement: "#live-payment-agreement",
  },
) {
  if (
    !/^live_gck_[A-Za-z0-9_]{8,500}$/.test(info.clientKey) ||
    !Number.isSafeInteger(info.amount) ||
    ![22000, 33000].includes(info.amount)
  )
    throw Error("결제 정보를 다시 확인해 주세요.");
  if (!window.TossPayments) {
    loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.tosspayments.com/v2/standard";
      script.referrerPolicy = "no-referrer";
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        loading = undefined;
        reject(
          Error(
            "카드 결제창을 불러오지 못했습니다. 같은 주문으로 다시 시도해 주세요.",
          ),
        );
      };
      const timer = setTimeout(fail, 15000);
      script.onload = () => {
        clearTimeout(timer);
        window.TossPayments ? resolve() : fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
    await loading;
  }
  const widget = window.TossPayments!(info.clientKey).widgets({
    customerKey: "ANONYMOUS",
  });
  await widget.setAmount({ currency: "KRW", value: info.amount });
  try {
    await widget.renderPaymentMethods({
      selector: targets.methods,
      variantKey: "DEFAULT",
    });
    const agreement = await widget.renderAgreement({
      selector: targets.agreement,
      variantKey: "AGREEMENT",
    });
    onAgreement(false);
    agreement.on("agreementStatusChange", (value) =>
      onAgreement(value.agreedRequiredTerms === true),
    );
    if (agreement.getAgreementStatus)
      onAgreement(
        (await agreement.getAgreementStatus()).agreedRequiredTerms === true,
      );
    return widget;
  } catch (error) {
    document.querySelector(targets.methods)?.replaceChildren();
    document.querySelector(targets.agreement)?.replaceChildren();
    onAgreement(false);
    throw error;
  }
}
