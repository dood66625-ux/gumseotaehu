/** Display-only cleanup: stored report, calculation evidence and PDF data stay intact. */
export function bookText(text: string, notes: string[]) {
  const moved: string[] = [];
  let body = text;
  for (const note of notes
    .filter((note) => !!note && /검수|독립 대조|진태양시|신강·용신/.test(note))
    .sort((a, b) => b.length - a.length)) {
    if (body.includes(note)) {
      body = body.split(note).join("");
      moved.push(note);
    }
  }
  body = body.replace(
    /\buncertainty\s*[:：]\s*([^\n]*)/gi,
    (_, note: string) => {
      if (note.trim()) moved.push(note.trim());
      return "";
    },
  );
  return {
    text: body
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    moved,
  };
}
