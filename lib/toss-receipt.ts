/** Provider-owned receipt endpoint only; never accepts caller-supplied redirect targets. */
export function safeTossReceiptUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\x00-\x20\x7f]/.test(value)
  )
    return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "dashboard.tosspayments.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.hash ||
      u.pathname !== "/receipt/redirection" ||
      !u.searchParams.get("transactionId") ||
      u.searchParams.getAll("transactionId").length !== 1 ||
      [...u.searchParams.keys()].some(
        (k) => !["transactionId", "ref"].includes(k),
      )
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
