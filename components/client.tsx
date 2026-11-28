"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/client-api";
export { api, ApiError } from "../lib/client-api";
export function useLoad<T>(path: string) {
  const generation = useRef(0);
  const [result, setResult] = useState<{
    path: string;
    data: T | null;
    error: string;
  }>({ path, data: null, error: "" });
  const load = useCallback(async () => {
    const current = ++generation.current;
    setResult({ path, data: null, error: "" });
    try {
      const data = await api<T>(path);
      if (generation.current === current) setResult({ path, data, error: "" });
    } catch (error) {
      if (generation.current === current)
        setResult({
          path,
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "요청을 처리하지 못했습니다.",
        });
    }
  }, [path]);
  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [load]);
  // Hide old data immediately during a path change, before the new effect runs.
  return {
    data: result.path === path ? result.data : null,
    error: result.path === path ? result.error : "",
    load,
  };
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
  const [demoMail, setDemoMail] = useState(false);
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [local, setLocal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestedAt, setRequestedAt] = useState(0),
    [now, setNow] = useState(0);
  useEffect(() => {
    if (!requestedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [requestedAt]);
  const retrySeconds = requestedAt
    ? Math.max(0, Math.ceil((requestedAt + 60000 - now) / 1000))
    : 0;
  const expired = !!requestedAt && now >= requestedAt + 900000;
  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (requestedAt && Date.now() < requestedAt + 60000)) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("auth/request", { email });
      setChallenge(r.challengeId);
      setDemoMail(r.demoMail === true);
      const time = Date.now();
      setRequestedAt(time);
      setNow(time);
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
        구매할 때 사용한 이메일로 인증번호를 받아 운명서를 다시 열람할 수
        있습니다.
      </p>
      <form onSubmit={request}>
        <div className="field">
          <label htmlFor="buyer-email">이메일 주소</label>
          <input
            id="buyer-email"
            type="email"
            autoComplete="email"
            required
            disabled={busy || !!challenge}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
        </div>
        <button
          className="button secondary"
          disabled={busy || retrySeconds > 0}
        >
          {retrySeconds > 0
            ? `${retrySeconds}초 후 다시 요청`
            : challenge
              ? "인증번호 다시 요청"
              : "인증번호 요청"}
        </button>
      </form>
      {challenge && (
        <>
          <p className="notice">
            {email} 주소의 인증번호입니다. 인증번호는 15분간 유효하며 5회까지
            입력할 수 있습니다. 새로 요청하면 이전 인증번호는 사용할 수
            없습니다.
          </p>
          {expired && (
            <p className="error" role="alert">
              인증번호가 만료됐습니다. 새 번호를 요청해주세요.
            </p>
          )}
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge("");
              setCode("");
              setLocal("");
              setError("");
              setRequestedAt(0);
              setNow(0);
            }}
          >
            이메일 주소 수정
          </button>
          {demoMail && (
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
          )}
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
            <button className="button" disabled={busy || expired}>
              이메일 인증 완료
            </button>
          </form>
        </>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
