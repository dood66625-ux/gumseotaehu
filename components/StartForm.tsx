"use client";
import { useRef, useState } from "react";
import { preload } from "react-dom";
import { api, ErrorBox } from "./client";
import {
  formatBirthDateInput,
  birthDateInputError,
} from "../lib/birth-date-input";
const questions = [
  "너를 어떻게 불러주면 되겠느냐?",
  "네가 태어난 날은 언제이느냐?",
  "호오… 기운이 점점 드러나는구나. 몇 시에 태어났느냐?",
  "그대의 큰 흐름도 함께 읽어보겠느냐?",
  "이제, 그대의 금서를 펼쳐 보겠느냐?",
];
export default function StartForm() {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [calendar, setCalendar] = useState("solar"),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  preload("/empress-expressions-1.webp", {
    as: "image",
    fetchPriority: "high",
  });
  if (step >= 2)
    preload("/empress-expressions-2.webp", {
      as: "image",
      fetchPriority: "low",
    });
  function changeStep(value: number) {
    setError("");
    setStep(value);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    if (step === 1) {
      const date = form.elements.namedItem("date") as HTMLInputElement;
      date.setCustomValidity(birthDateInputError(date.value, calendar));
    }
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
    if (step < 4) {
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
    <form
      onSubmit={submit}
      noValidate
      className="birth-wizard"
      data-step={step}
      data-unknown-time={unknown}
    >
      <div className="birth-portrait" key={step}>
        <div
          className="empress-expression"
          role="img"
          aria-label={`금서태후의 ${["반기는", "귀 기울이는", "응원하는", "미소 짓는", "평온한"][step]} 초상`}
          style={{
            backgroundImage:
              step < 4
                ? "var(--empress-expressions-first)"
                : "var(--empress-expressions-second)",
            backgroundPosition: `${step % 2 ? "100%" : "0%"} ${step % 4 >= 2 ? "100%" : "0%"}`,
          }}
        />
      </div>
      <p className="birth-step" aria-live="polite">
        {step + 1} / 5 ·{" "}
        {["이름", "태어난 날", "태어난 시각", "큰 흐름", "금서 열기"][step]}
      </p>
      <div className="birth-conversation">
        <h1
          ref={heading}
          tabIndex={-1}
          className="birth-question"
          key={"question-" + step}
        >
          {step === 2 ? (
            <>
              <span className="birth-whisper">
                호오… 기운이 점점 드러나는구나.
              </span>
              몇 시에 태어났느냐?
            </>
          ) : (
            questions[step]
          )}
        </h1>
        <fieldset className="card" data-step="0" hidden={step !== 0}>
          <legend className="sr-only">그대의 이름</legend>
          <div className="field">
            <label htmlFor="name">이름 또는 별명</label>
            <input
              id="name"
              name="name"
              placeholder="태후가 부를 이름을 적어주거라"
              maxLength={24}
              required
              autoComplete="off"
            />
          </div>
          <p className="hint">실명 대신 편한 별명을 적어도 좋으니라.</p>
        </fieldset>
        <fieldset className="card" data-step="1" hidden={step !== 1}>
          <legend className="sr-only">태어난 날</legend>
          <div className="field">
            <label htmlFor="date">생년월일</label>
            <input
              id="date"
              name="date"
              type="text"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
              required
              onChange={(e) => {
                e.currentTarget.value = formatBirthDateInput(
                  e.currentTarget.value,
                );
                e.currentTarget.setCustomValidity("");
              }}
            />
          </div>
          <div className="field birth-calendar">
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
          {calendar === "lunar" && (
            <label className="check">
              <input name="leap" type="checkbox" />
              음력 윤달에 태어났습니다
            </label>
          )}
          <p className="hint">
            숫자 8자리로 적어도 좋으니라. 1989~2030년 한국 출생 기준이니라.
          </p>
        </fieldset>
        <fieldset className="card" data-step="2" hidden={step !== 2}>
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
          {unknown && (
            <p className="hint">
              시각을 모르면 시주·대운 시작시각은 제외하느니라.
            </p>
          )}
          <details className="birth-more">
            <summary>출생시각 안내</summary>
            <p className="hint">
              한국 표준시 기준이며 해외 출생은 아직 지원하지 않느니라.
            </p>
          </details>
        </fieldset>
        <fieldset className="card" data-step="3" hidden={step !== 3}>
          <legend className="sr-only">대운 계산 기준</legend>
          <div className="field">
            <label htmlFor="sex">전통 대운 계산 구분</label>
            <select id="sex" name="sex" defaultValue="unspecified">
              <option value="unspecified">선택하지 않음 · 대운 제외</option>
              <option value="male">남 기준</option>
              <option value="female">여 기준</option>
            </select>
          </div>
          <details className="birth-more">
            <summary>대운 계산 안내</summary>
            <p className="hint">
              시각을 모르면 시주·대운 시작시각은 제외하느니라. 위 구분은 전통
              대운의 순역 계산에만 사용하며 성 정체성을 추론하지 않느니라. 한국
              표준시 기준이며 해외 출생은 아직 지원하지 않느니라.
            </p>
          </details>
        </fieldset>
        <fieldset className="card" data-step="4" hidden={step !== 4}>
          <legend className="sr-only">정보 처리 확인</legend>
          <p className="hint">그대의 정보는 조심히 다루겠노라.</p>
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
          <details className="birth-more">
            <summary>정보 보관·풀이 안내</summary>
            <p className="hint">
              출생정보와 별명을 사주 계산에 사용합니다. 미구매 정보는 24시간 후
              정리하며 구매 정보는 1년 재열람 정책에 따라 보관합니다. 이
              단계에서는 외부 전송을 하지 않습니다. 브라우저 저장소에 출생정보를
              보관하지 않습니다. 전통 해석은 미래를 확정하지 않습니다.
            </p>
          </details>
          <ErrorBox error={error} />
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
              ? "그대의 기운을 살피는 중…"
              : step < 4
                ? "다음 →"
                : "무료 사주풀이 펼치기 ↗"}
          </button>
        </div>
      </div>
    </form>
  );
}
