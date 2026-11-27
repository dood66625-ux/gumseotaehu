/** Keep the original wording while grouping long prose into short, readable paragraphs. */
export function readingParagraphs(text: string) {
  const blocks: string[] = [];
  for (const line of text.trim().split(/\n+/).filter(Boolean)) {
    const sentences = line.split(/(?<=[.!?。！？])\s+/u);
    let part = "";
    for (const sentence of sentences) {
      if (part && part.length + sentence.length > 170) {
        blocks.push(part.trim());
        part = "";
      }
      part += (part ? " " : "") + sentence;
    }
    if (part.trim()) blocks.push(part.trim());
  }
  return blocks.map((text, i) => {
    const first = text.match(/^.*?[.!?。！？](?=\s|$)/u)?.[0] ?? text;
    const emphasis =
      (i === 0 || (blocks.length > 2 && i === blocks.length - 1)) &&
      first.length <= 150
        ? first
        : "";
    return { text, emphasis };
  });
}
