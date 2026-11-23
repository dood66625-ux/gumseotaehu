"use client";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import { taehouNarration } from "../lib/taehou-narration";
import { PRODUCT_PRICE_TEXT } from "../lib/product";
import Link from "next/link";
import { previewExplanations } from "../lib/preview-explanations";
import ScreenFlow from "./ScreenFlow";
import { useLoad, Loading, ErrorBox } from "./client";
import { chapterTitles } from "../lib/report-titles";
export default function Preview({ id }: { id: string }) {
  const list = useRef<HTMLDialogElement>(null);
  preload("/empress-expressions-1.webp", {
    as: "image",
    fetchPriority: "high",
  });
  useEffect(() => {
    preload("/empress-expressions-2.webp", {
      as: "image",
      fetchPriority: "low",
    });
  }, []);
  const { data: r, error } = useLoad<any>("readings/" + id);
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading />;
  const explanation = previewExplanations(r.chart);
  return (
    <>
      <ScreenFlow
        pages={[
          {
            title: `${r.input.name} 님의 기운`,
            content: (
              <p className="quote">{taehouNarration(r.preview.intro)}</p>
            ),
          },
          {
            title: "그대의 사주 기둥",
            content: (
              <section className="preview-explained">
                <div className="pillars">
                  {r.chart.pillars.map((p: string | null, i: number) => (
                    <div className="pillar" key={i}>
                      <small>{["년주", "월주", "일주", "시주"][i]}</small>
                      <b>{p || "미상"}</b>
                      <small>{r.chart.tenGods[i] || "산출 제외"}</small>
                    </div>
                  ))}
                </div>
                <p className="preview-explanation">{explanation.pillars}</p>
              </section>
            ),
          },
          {
            title: "그대의 오행",
            content: (
              <section className="preview-explained">
                <div className="element-bars">
                  {Object.entries(r.chart.counts).map(([k, v]) => (
                    <div className="element-bar" key={k}>
                      <i
                        style={{ height: Math.min(88, Number(v) * 12) + "px" }}
                      />
                      <span>
                        {k} · {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="preview-explanation">{explanation.elements}</p>
              </section>
            ),
          },
          ...r.preview.cards.map((card: any) => ({
            title: card.title,
            content: <p>{taehouNarration(card.text)}</p>,
          })),
          {
            title: "금서에 담긴 아홉 장",
            content: (
              <section className="preview-purchase">
                <p className="quote preview-invitation">
                  자, 그대의 운명을 제대로 들여다볼 준비가 되었느냐?
                </p>
                {r.purchaseEligible !== false &&
                r.input.age !== "14-18" &&
                r.input.age !== "under14" ? (
                  <Link className="button" href={"/checkout?id=" + id}>
                    {PRODUCT_PRICE_TEXT}원 결제 후 운명서 펼쳐보기
                  </Link>
                ) : (
                  <p className="notice">
                    만 14~18세 유료 구매는 보호자 확인 절차 준비 전까지 제한하고
                    있느니라. 무료 풀이를 살펴보거라.
                  </p>
                )}
                <button
                  type="button"
                  className="chapter-list-trigger"
                  onClick={() => list.current?.showModal()}
                >
                  아홉 장에 담긴 금기 목록 ↗
                </button>
                <p className="hint">
                  현재 체험은 실제 청구가 없느니라. 웹·PDF · 1년 재열람 ·{" "}
                  <Link href="/legal/refund">환불 규정</Link>
                </p>
              </section>
            ),
          },
        ]}
      />
      <dialog
        ref={list}
        className="chapter-dialog"
        aria-labelledby="chapter-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              list.current?.close();
          }
        }}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="금기 목록 닫기"
          onClick={() => list.current?.close()}
        >
          ×
        </button>
        <p className="eyebrow">禁書 · 아홉 장의 기록</p>
        <h2 id="chapter-dialog-title">아홉 장에 담긴 금기 목록</h2>
        <ol>
          {chapterTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ol>
        <p>그대를 이해하고, 앞으로의 선택을 돌아보는 한 권이니라.</p>
      </dialog>
    </>
  );
}
