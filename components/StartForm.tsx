"use client";
import { useRef, useState } from "react";
import { api, ErrorBox } from "./client";
export default function StartForm() {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLParagraphElement>(null);
  function changeStep(value: number) {
    setStep(value);
    requestAnimationFrame(() => heading.current?.focus());
  }
  const [calendar, setCalendar] = useState("solar"),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fields = [
      ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        `fieldset[data-step="${step}"] input, fieldset[data-step="${step}"] select`,
      ),
    ];
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (step < 2) {
      changeStep(step + 1);
      return;
    }
    const f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const r = await api("readings", {
        name: f.get("name"),
        date: f.get("date"),
        calendar,
        leap: calendar === "lunar" && f.get("leap") === "on",
        time: unknown ? null : f.get("time"),
        sex: f.get("sex"),
        place: "KR",
        self: f.get("self") === "on",
        consent: f.get("consent") === "on",
      });
      window.location.href = "/reading/preview?id=" + r.id;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} noValidate className="birth-wizard">
        <p
          ref={heading}
          tabIndex={-1}
          className="birth-step"
          aria-live="polite"
        >
          {step + 1} / 3 ·{" "}
          {["그대의 이름과 생일", "태어난 시각", "확인하고 펼치기"][step]}
        </p>
        <fieldset className="card" data-step="0" hidden={step !== 0}>
          <legend className="sr-only">이름과 생일</legend>
          <p className="hint">
            실명은 필요 없느니라. 1989년 이후 한국 출생, 만 14세 이상 본인만
            풀이할 수 있느니라.
          </p>
          <div className="field">
            <label htmlFor="name">어떻게 불러드릴까요?</label>
            <input
              id="name"
              name="name"
              placeholder="그대의 별명"
              maxLength={24}
              required
              autoComplete="off"
            />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="calendar">달력 기준</label>
              <select
                id="calendar"
                value={calendar}
                onChange={(e) => setCalendar(e.target.value)}
              >
                <option value="solar">양력</option>
                <option value="lunar">음력</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="date">생년월일</label>
              <input
                id="date"
                name="date"
                type={calendar === "solar" ? "date" : "text"}
                placeholder={
                  calendar === "lunar" ? "YYYY-MM-DD (음력 날짜)" : undefined
                }
                pattern={
                  calendar === "lunar"
                    ? "[0-9]{4}-[0-9]{2}-[0-9]{2}"
                    : undefined
                }
                min={calendar === "solar" ? "1989-01-01" : undefined}
                max={calendar === "solar" ? "2030-12-31" : undefined}
                required
              />
            </div>
          </div>
          {calendar === "lunar" && (
            <label className="check">
              <input name="leap" type="checkbox" />
              음력 윤달에 태어났습니다
            </label>
          )}
        </fieldset>
        <fieldset className="card" data-step="1" hidden={step !== 1}>
          <legend className="sr-only">태어난 시각과 대운 계산</legend>
          <div className="field">
            <label htmlFor="time">출생시간</label>
            <input
              id="time"
              name="time"
              type="time"
              required={!unknown}
              disabled={unknown}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={unknown}
              onChange={(e) => setUnknown(e.target.checked)}
            />
            출생시간을 모릅니다
          </label>
          <p className="hint">
            미상인 경우 시주와 대운 시작시각을 만들지 않습니다.
          </p>
          <div className="field">
            <label htmlFor="sex">전통 대운 계산 구분</label>
            <select id="sex" name="sex" defaultValue="unspecified">
              <option value="unspecified">선택하지 않음 · 대운 제외</option>
              <option value="male">남 기준</option>
              <option value="female">여 기준</option>
            </select>
            <p className="hint">
              전통 학파의 대운 순역 계산에만 사용하며, 성 정체성을 추론하지
              않습니다.
            </p>
          </div>
          <p className="hint">
            한국 표준시(Asia/Seoul) 기준으로 계산합니다. 해외 출생은 현재
            지원하지 않습니다.
          </p>
        </fieldset>
        <fieldset className="card" data-step="2" hidden={step !== 2}>
          <legend className="sr-only">정보 처리 확인</legend>
          <h2>그대의 정보는 조심히 다루겠습니다.</h2>
          <p className="hint">
            출생정보와 별명을 사주 계산에 사용합니다. 미구매 정보는 24시간 후
            정리하며 구매 정보는 1년 재열람 정책에 따라 보관합니다. 외부 전송은
            하지 않습니다.
          </p>
          <label className="check">
            <input name="self" type="checkbox" required />
            <span>
              풀이 대상자는 본인이며 만 14세 이상입니다. 타인의 정보를 입력하지
              않습니다.
            </span>
          </label>
          <label className="check">
            <input name="consent" type="checkbox" required />
            <span>
              <a href="/legal/privacy" target="_blank" rel="noreferrer">
                개인정보 수집·이용 고지
              </a>
              를 확인하고 계산에 필요한 정보 처리에 동의합니다.
            </span>
          </label>
          <ErrorBox error={error} />
          <p className="fine">
            브라우저 저장소에 출생정보를 보관하지 않습니다. 전통 해석은 미래를
            확정하지 않습니다.
          </p>
        </fieldset>
        <div className="birth-step-actions">
          {step > 0 && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => changeStep(step - 1)}
            >
              이전
            </button>
          )}
          <button type="submit" className="button" disabled={busy}>
            {busy
              ? "실제 계산 중…"
              : step < 2
                ? "다음 →"
                : "무료 사주풀이 펼치기 ↗"}
          </button>
        </div>
      </form>
    </>
  );
}
