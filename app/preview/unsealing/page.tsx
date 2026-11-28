import ReportUnsealing from "@/components/ReportUnsealing";

export const metadata = {
  title: "운명서 작성 애니메이션 미리보기",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ReportUnsealing id="" ready={false} preview />;
}
