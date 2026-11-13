"use client";
import { useCallback, useEffect, useState } from "react";
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined && path !== "session")
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "요청을 처리하지 못했습니다.");
  return value;
}
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<T>(path)
        .then((v) => {
          setData(v);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [path],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load };
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span>禁</span>저장된 상태를 확인하고 있습니다.
    </div>
  );
}
export function EmailAuth({ onVerified }: { onVerified: () => void }) {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [local, setLocal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("auth/request", { email });
      setChallenge(r.challengeId);
      setLocal("");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/verify", { challengeId: challenge, code });
      onVerified();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <h2>이메일로 안전하게 인증</h2>
      <p className="hint">
        운명서를 다시 찾을 때 사용할 주소입니다. 현재 체험판에서는 실제 이메일을
        발송하지 않습니다.
      </p>
      <form onSubmit={request}>
        <div className="field">
          <label htmlFor="buyer-email">이메일 주소</label>
          <input
            id="buyer-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
        </div>
        <button className="button secondary" disabled={busy}>
          인증번호 요청
        </button>
      </form>
      {challenge && (
        <>
          <p className="notice">
            인증번호는 15분간 유효하며 5회까지 입력할 수 있습니다.
          </p>
          <button
            className="text-button"
            type="button"
            onClick={async () => {
              try {
                const r = await api("local-mail/" + challenge);
                setLocal(r.code);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            체험용 인증번호 확인
          </button>
          {local && (
            <div className="notice">
              실제 발송 없이 확인하는 체험용 인증번호
              <strong className="otp-code" data-testid="otp">
                {local}
              </strong>
            </div>
          )}
          <form onSubmit={verify}>
            <div className="field">
              <label htmlFor="otp-input">인증번호 6자리</label>
              <input
                id="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button className="button" disabled={busy}>
              이메일 인증 완료
            </button>
          </form>
        </>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
