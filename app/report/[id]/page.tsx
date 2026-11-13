import ReportReader from "@/components/ReportReader";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="page">
      <ReportReader id={(await params).id} />
    </div>
  );
}
