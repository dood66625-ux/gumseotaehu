import Checkout from "@/components/Checkout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  return (
    <div className="page">
      <Checkout id={(await searchParams).id || ""} />
    </div>
  );
}
