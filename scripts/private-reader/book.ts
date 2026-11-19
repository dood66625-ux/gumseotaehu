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

/** Extract one intact sentence from the saved text; never invent or request new interpretation. */
export function chapterTakeaway(text: string, locale: "ko" | "zh-TW") {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences =
    typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(
            normalized,
          ),
        ].map((s) => s.segment.trim())
      : normalized.split(/(?<=[.!?。！？])\s+|(?<=[。！？])/u).filter(Boolean);
  const practical =
    locale === "ko"
      ? /기록|살펴|정해|실천|확인|골라|시도|돌보|보거라|하거라/
      : /記錄|留意|選擇|試著|不妨|可以|照顧|練習/;
  const incomplete = /^(하지만|그러나|다만|반면|因此|但是|不過|然而)/;
  const ranked = sentences.map((sentence, i) => ({
    sentence,
    score:
      (practical.test(sentence) ? 4 : 0) +
      (sentence.length >= 12 && sentence.length <= 120 ? 2 : 0) -
      (incomplete.test(sentence) ? 5 : 0),
    i,
  }));
  ranked.sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked[0]?.sentence ?? normalized;
}
