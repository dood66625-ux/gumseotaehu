"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorBox } from "./client";
export default function EmailChange({ orderId }: { orderId: string }) {
  const [demoMail, setDemoMail] = useState(false);
  const [changeId, setChangeId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [code, setCode] = useState(""),
    [targetEmail, setTargetEmail] = useState(""),
    [requestedAt, setRequestedAt] = useState(0),
    [now, setNow] = useState(0);
  useEffect(() => {
    if (!requestedAt || done) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [requestedAt, done]);
  const expired = !!requestedAt && now >= requestedAt + 15 * 60000;
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
            if (busy || (changeId && expired)) return;
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (!changeId) {
                const r = await api("email-change/request", {
                  orderId,
                  email: f.get("newEmail"),
                });
                setTargetEmail(String(f.get("newEmail")).trim().toLowerCase());
                setChangeId(r.changeId);
                setDemoMail(r.demoMail === true);
                const time = Date.now();
                setRequestedAt(time);
                setNow(time);
                setCode("");
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
                defaultValue={targetEmail}
                disabled={busy}
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
          ) : (
            <>
              <p className="hint">
                {targetEmail} 주소의 변경 인증번호입니다. 15분간 유효하며
                5회까지 입력할 수 있습니다. 새로 요청하면 이전 변경 인증번호는
                사용할 수 없습니다.
              </p>
              {expired && (
                <p className="error" role="alert">
                  변경 인증번호가 만료됐습니다. 주소를 확인한 뒤 새 번호를
                  요청해주세요.
                </p>
              )}
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setChangeId("");
                  setCode("");
                  setError("");
                  setRequestedAt(0);
                  setNow(0);
                }}
              >
                새 이메일 수정 · 다시 요청
              </button>
              <p className="notice">
                새 이메일로 받은 인증번호를 입력해주세요.
              </p>
              {demoMail && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || expired}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await api("email-change/local-code", {
                        changeId,
                      });
                      setCode(r.code);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  변경용 체험 인증번호 확인
                </button>
              )}
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
                  disabled={busy || expired}
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
          <button
            className="button secondary"
            disabled={busy || (!!changeId && expired)}
          >
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
