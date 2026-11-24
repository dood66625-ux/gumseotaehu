/** Input convenience only; the existing server calendar/age checks remain authoritative. */
export function formatBirthDateInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 8);
  return (
    digits.slice(0, 4) +
    (digits.length > 4 ? "-" + digits.slice(4, 6) : "") +
    (digits.length > 6 ? "-" + digits.slice(6) : "")
  );
}
export function birthDateInputError(value: string, calendar: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return "생년월일을 YYYY-MM-DD 형식으로 적어주거라.";
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1989 || year > 2030)
    return "현재는 1989~2030년 출생만 읽을 수 있느니라.";
  if (month < 1 || month > 12) return "태어난 달을 01~12 사이로 적어주거라.";
  const last =
    calendar === "lunar" ? 30 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > last)
    return calendar === "lunar"
      ? "음력 날짜는 01~30 사이로 적어주거라."
      : "그달에 없는 날짜이니, 생일을 다시 살펴보거라.";
  return "";
}
