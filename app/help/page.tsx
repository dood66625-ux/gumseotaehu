import Link from "next/link";
import Help from "@/components/Help";
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">WE KEEP YOUR STORY SAFE</p>
      <h1>운명서를 다시 펼치는 길.</h1>
      <p className="page-intro">
        창을 닫았거나 PDF를 잊으셨나요?{" "}
        <Link href="/recover">운명서 다시 찾기</Link>로 무료 재열람할 수
        있습니다.
      </p>
      <Help />
    </div>
  );
}
