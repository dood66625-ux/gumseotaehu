"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ErrorBox } from "./client";
export default function EmailChange({ orderId }: { orderId: string }) {
  const [changeId, setChangeId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [code, setCode] = useState("");
  const suffix = orderId.slice(0, 8);
  return (
    <details className="card">
      <summary>구매 이메일 변경</summary>
      <p className="hint">
        기존 구매 이메일의 최근 인증과 새 이메일의 소유 확인이 모두 필요합니다.
        기존 주소를 사용할 수 없다면 구매·개인정보 요청으로 접수해 주세요. 변경
        후에는 새 주소로 다시 인증합니다.
      </p>
      {done ? (
        <>
          <p role="status">
            이메일이 변경되었습니다. 추가 결제 없이 같은 운명서를 확인할 수
            있습니다.
          </p>
          <Link className="button secondary" href="/recover">
            새 이메일로 인증하기
          </Link>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (!changeId) {
                const r = await api("email-change/request", {
                  orderId,
                  email: f.get("newEmail"),
                });
                setChangeId(r.changeId);
              } else {
                await api("email-change/confirm", {
                  changeId,
                  code: f.get("changeCode"),
                });
                setDone(true);
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!changeId ? (
            <div className="field">
              <label htmlFor={"new-email-" + suffix}>새 구매 이메일</label>
              <input
                id={"new-email-" + suffix}
                name="newEmail"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
          ) : (
            <>
              <p className="notice">
                로컬 검증판은 실제 이메일을 발송하지 않습니다.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={async () => {
                  try {
                    const r = await api("email-change/local-code", {
                      changeId,
                    });
                    setCode(r.code);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                변경용 체험 인증번호 확인
              </button>
              {code && (
                <p className="hint">
                  체험 인증번호 <span data-testid="change-otp">{code}</span>
                </p>
              )}
              <div className="field">
                <label htmlFor={"change-code-" + suffix}>
                  이메일 변경 인증번호
                </label>
                <input
                  id={"change-code-" + suffix}
                  name="changeCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </div>
            </>
          )}
          <ErrorBox error={error} />
          <button className="button secondary" disabled={busy}>
            {busy
              ? "확인 중…"
              : changeId
                ? "이메일 변경 확정"
                : "새 이메일 확인 요청"}
          </button>
        </form>
      )}
    </details>
  );
}
