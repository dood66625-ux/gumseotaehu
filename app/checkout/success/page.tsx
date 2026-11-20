import PaymentReturn from "@/components/PaymentReturn";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    paymentKey?: string;
    amount?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <div className="page">
      <PaymentReturn
        key={params.orderId + ":" + (params.paymentKey ?? "")}
        id={params.orderId || ""}
        paymentKey={params.paymentKey}
        amount={params.amount}
      />
    </div>
  );
}
