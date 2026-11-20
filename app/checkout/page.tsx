import Checkout from "@/components/Checkout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const id = (await searchParams).id || "";
  return (
    <div className="page">
      <Checkout key={id} id={id} />
    </div>
  );
}
