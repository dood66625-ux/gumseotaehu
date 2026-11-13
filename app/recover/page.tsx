import Recover from "@/components/Recover";
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">YOUR STORY IS STILL HERE</p>
      <h1>
        그대의 운명서,
        <br />
        다시 펼쳐보거라.
      </h1>
      <p className="page-intro">
        구매 이메일 인증 후 1년 동안 무료로 재열람할 수 있습니다.
        <br />
        PDF를 저장하지 못했어도 다시 결제할 필요 없습니다.
      </p>
      <Recover />
    </div>
  );
}
