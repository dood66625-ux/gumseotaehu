import StartForm from "@/components/StartForm";
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">UNFOLD YOUR OWN STORY</p>
      <h1>
        그대의 이야기는
        <br />
        여기에서 시작되느니라.
      </h1>
      <p className="page-intro">
        입력한 정보로 만세력을 계산한 뒤 무료 풀이를 보여드립니다.
      </p>
      <StartForm />
    </div>
  );
}
