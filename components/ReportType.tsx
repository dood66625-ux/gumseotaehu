"use client";
import ReportTypeImage from "./ReportTypeImage";
import { useState } from "react";
import { reportType } from "../lib/report-type";
export default function ReportType({
  chart,
  compact = false,
}: {
  chart: Parameters<typeof reportType>[0];
  compact?: boolean;
}) {
  const type = reportType(chart);
  const [message, setMessage] = useState("");
  async function share() {
    setMessage("");
    try {
      if (navigator.share)
        await navigator.share({
          title: `금서태후 · ${type.name}`,
          text: type.shareText,
          url: type.shareUrl,
        });
      else {
        await navigator.clipboard.writeText(
          type.shareText + "\n" + type.shareUrl,
        );
        setMessage("타입 소개를 복사했느니라. 친구에게 붙여넣어 보거라.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage("공유창을 열지 못했느니라. 브라우저의 공유 기능을 이용해 보거라.");
    }
  }
  return (
    <section
      className={compact ? "report-type compact" : "card gold report-type"}
      aria-label="그대의 대표 타입"
    >
      <ReportTypeImage index={type.imageIndex} name={type.name} />
      <p className="eyebrow">금서태후가 읽은 그대의 타입</p>
      <h2>{type.name}</h2>
      <p className="type-title">{type.title}</p>
      <p>{type.lead}</p>
      <p className="type-tags">{type.tags.map((t) => "#" + t).join(" ")}</p>
      {!compact && <p>{type.action}</p>}
      <button className="button secondary" type="button" onClick={share}>
        내 타입 친구에게 보여주기
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
