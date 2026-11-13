import Preview from "@/components/Preview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const q = await searchParams;
  return (
    <div className="page">
      <Preview id={q.id || ""} />
    </div>
  );
}
