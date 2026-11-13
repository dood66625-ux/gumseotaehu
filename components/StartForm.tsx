"use client";
import { useState } from "react";
import { api, ErrorBox } from "./client";
export default function StartForm() {
  const [age, setAge] = useState(""),
    [calendar, setCalendar] = useState("solar"),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
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
        place: f.get("place"),
        age,
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
      <div className="card">
        <p className="eyebrow">먼저 확인할 이야기</p>
        <h2>그대를 맞이하기 전에.</h2>
        <div className="field">
          <label htmlFor="age">이용자·구매자 연령</label>
          <select
            id="age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            required
          >
            <option value="">선택해 주세요</option>
            <option value="under14">만 14세 미만</option>
            <option value="14-18">만 14~18세 · 무료 풀이만 이용</option>
            <option value="19+">만 19세 이상</option>
          </select>
        </div>
        <p className="hint">
          구매자 연령은 풀이 대상자의 출생일에서 추정하지 않습니다. 현재는 본인
          풀이만 지원합니다.
        </p>
        {age === "under14" && (
          <p className="error" role="alert">
            만 14세 미만은 이용 및 개인정보 입력이 제한됩니다.
          </p>
        )}
        {age === "14-18" && (
          <p className="notice">
            무료 풀이를 이용할 수 있습니다. 적법한 보호자 확인 절차가 준비되기
            전까지 유료 구매는 차단됩니다.
          </p>
        )}
      </div>
      {(age === "19+" || age === "14-18") && (
        <form onSubmit={submit}>
          <div className="card">
            <p className="eyebrow">그대의 생이 시작된 순간</p>
            <h2>태어난 순간을 들려주거라.</h2>
            <p className="hint">
              실명은 필요 없습니다. 현재 지원 범위는 1989년 이후 한국 출생,
              대상자 본인 만 14세 이상. 해외 출생·역사 시간대·제3자 입력은
              지원하지 않습니다.
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
            <div className="field">
              <label htmlFor="place">출생 국가·시간대 확인</label>
              <select id="place" name="place" required defaultValue="">
                <option value="">직접 확인해 주세요</option>
                <option value="KR">대한민국 출생 · 한국 표준시</option>
              </select>
            </div>
          </div>
          <div className="card">
            <h3>그대의 정보는 조심히 다루겠습니다.</h3>
            <p className="hint">
              출생정보·별명·연령구분을 사주 계산에 사용합니다. 미구매 정보는
              24시간 후 정리하며 구매 정보는 1년 재열람 정책에 따라 보관합니다.
              외부 전송은 하지 않습니다.
            </p>
            <label className="check">
              <input name="self" type="checkbox" required />
              <span>
                풀이 대상자는 본인이며 만 14세 이상입니다. 타인의 정보를
                입력하지 않습니다.
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
            <button
              className="button"
              style={{ width: "100%" }}
              disabled={busy}
            >
              {busy ? "실제 계산 중…" : "무료 사주풀이 펼치기 ↗"}
            </button>
            <p className="fine">
              브라우저 저장소에 출생정보를 보관하지 않습니다. 전통 해석은 미래를
              확정하지 않습니다.
            </p>
          </div>
        </form>
      )}
    </>
  );
}
