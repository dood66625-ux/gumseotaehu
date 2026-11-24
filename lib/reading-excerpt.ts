/** Keep whole sentences so conditions and negative advice aren't cut in half. */
export function readingExcerpt(text: string, limit = 100) {
  const parts = text
    .trim()
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .filter(Boolean);
  let result = "";
  for (const part of parts) {
    if (result && result.length + part.length + 1 > limit) break;
    result += (result ? " " : "") + part;
    if (result.length >= limit) break;
  }
  return result;
}
