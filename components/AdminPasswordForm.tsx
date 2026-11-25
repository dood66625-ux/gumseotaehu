"use client";
import { useState } from "react";
import { api, ErrorBox } from "./client";
export default function AdminPasswordForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="card">
      <summary>관리자 비밀번호 변경</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          if (f.get("password") !== f.get("confirm")) {
            setError("새 비밀번호가 일치하지 않습니다.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api("admin/password", {
              currentPassword: f.get("current"),
              password: f.get("password"),
            });
            location.assign("/admin");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          현재 비밀번호
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        <label>
          새 비밀번호 (12~200자)
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
          />
        </label>
        <ErrorBox error={error} />
        <button className="button secondary" disabled={busy}>
          변경 후 다시 로그인
        </button>
      </form>
    </details>
  );
}
