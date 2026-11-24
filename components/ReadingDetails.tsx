"use client";
import { useId, useRef, type ReactNode } from "react";
export default function ReadingDetails({
  title,
  brief,
  children,
}: {
  title: string;
  brief: ReactNode;
  children: ReactNode;
}) {
  const modal = useRef<HTMLDialogElement>(null),
    label = useId();
  return (
    <div className="reading-details">
      <div className="reading-brief">{brief}</div>
      <button
        type="button"
        className="button secondary reading-detail-open"
        onClick={() => modal.current?.showModal()}
        aria-haspopup="dialog"
      >
        자세히 보기
      </button>
      <div className="reading-print-full">{children}</div>
      <dialog
        ref={modal}
        className="reading-detail-dialog"
        aria-labelledby={label}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            modal.current?.close();
        }}
      >
        <div className="reading-dialog-bar">
          <h2 id={label}>{title}</h2>
          <button
            type="button"
            className="button secondary"
            aria-label="상세 풀이 닫기"
            onClick={() => modal.current?.close()}
          >
            닫기 ×
          </button>
        </div>
        <div className="reading-detail-body">{children}</div>
      </dialog>
    </div>
  );
}
