import PaymentStatus from "@/components/PaymentStatus";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  return (
    <div className="page">
      <PaymentStatus id={(await searchParams).orderId || ""} />
    </div>
  );
}
