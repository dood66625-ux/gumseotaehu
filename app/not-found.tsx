import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page">
      <h1>이 페이지는 펼칠 수 없습니다.</h1>
      <p>주소를 확인하거나 이메일로 운명서를 다시 찾아주세요.</p>
      <div className="actions">
        <Link className="button" href="/">
          처음으로
        </Link>
        <Link className="button secondary" href="/recover">
          운명서 다시 찾기
        </Link>
      </div>
    </div>
  );
}
