"use client";
import { PRODUCT_PRICE_TEXT } from "../lib/product";
import Link from "next/link";
import ScreenFlow from "./ScreenFlow";
import { useLoad, Loading, ErrorBox } from "./client";
import { chapterTitles } from "@/lib/report-titles";
export default function Preview({ id }: { id: string }) {
  const { data: r, error } = useLoad<any>("readings/" + id);
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading />;
  return (
    <ScreenFlow
      pages={[
        {
          title: `${r.input.name} 님의 기운`,
          content: (
            <>
              <span className="status">만세력 계산 완료 · 첫 번째 풀이</span>
              <div className="card gold">
                <img
                  className="mini-portrait"
                  src="/empress-avatar-v2.webp"
                  width="74"
                  height="90"
                  alt="금서태후"
                />
                <p className="eyebrow">금서태후가 그대에게</p>
                <p className="quote">{r.preview.intro}</p>
              </div>
            </>
          ),
        },
        {
          title: "그대의 사주 기둥",
          content: (
            <>
              <div className="pillars">
                {r.chart.pillars.map((p: string | null, i: number) => (
                  <div className="pillar" key={i}>
                    <small>{["년주", "월주", "일주", "시주"][i]}</small>
                    <b>{p || "미상"}</b>
                    <small>{r.chart.tenGods[i] || "산출 제외"}</small>
                  </div>
                ))}
              </div>
            </>
          ),
        },
        {
          title: "그대의 오행",
          content: (
            <>
              <div className="card">
                <h2>그대의 오행</h2>
                <p className="hint">
                  천간·지지 본기 단순 개수 · 강약/길흉 판단이 아닙니다.
                </p>
                <div className="element-bars">
                  {Object.entries(r.chart.counts).map(([k, v]) => (
                    <div className="element-bar" key={k}>
                      <i style={{ height: (v as number) * 22 + "px" }} />
                      <span>
                        {k} · {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ),
        },
        ...r.preview.cards.map((c: any) => ({
          title: c.title,
          content: (
            <article className="card" key={c.title}>
              <h2>{c.title}</h2>
              <p>{c.text}</p>
              <details className="report-disclosure">
                <summary>이 풀이의 계산 근거</summary>
                <p>{c.claimIds.join(", ")}</p>
              </details>
            </article>
          ),
        })),
        {
          title: "금서에 담긴 아홉 장",
          content: (
            <div className="card">
              <p>{r.preview.bridge}</p>
              <ul className="chapter-list">
                {chapterTitles.map((title, i) => (
                  <li key={title}>
                    {i + 1}. {title}
                  </li>
                ))}
              </ul>
            </div>
          ),
        },
        {
          title: "봉인된 종합 운명서",
          content: (
            <>
              <section className="card gold">
                <p className="price">
                  {PRODUCT_PRICE_TEXT}원 <small>한 번만 결제 · 구독 없음</small>
                </p>
                {r.purchaseEligible !== false &&
                r.input.age !== "14-18" &&
                r.input.age !== "under14" ? (
                  <Link
                    className="button"
                    style={{ width: "100%" }}
                    href={"/checkout?id=" + id}
                  >
                    종합 운명서 구매 살펴보기 ↗
                  </Link>
                ) : (
                  <p className="notice">
                    만 14~18세 유료 구매는 보호자 확인 절차 준비 전까지
                    제한합니다. 추가 결제 없이 위 무료 풀이를 이용하세요.
                  </p>
                )}
                <p className="hint">
                  현재는 실제 청구 없는 모의 결제입니다. 웹·PDF, 구매 후 1년
                  재열람.{" "}
                  <Link href="/legal/refund">청약철회·환불 정책 확인</Link>
                </p>
              </section>
              <div className="actions">
                <Link className="button secondary" href="/start">
                  입력정보 다시 작성
                </Link>
              </div>
            </>
          ),
        },
        ...[
          ...r.chart.notes,
          `${r.chart.meta.engine} · ${r.chart.meta.ziHourPolicy}`,
        ].map((note: string, index: number) => ({
          title: `계산 안내 ${index + 1}`,
          content: (
            <div className="card">
              <p>{note}</p>
            </div>
          ),
        })),
      ]}
    />
  );
}
