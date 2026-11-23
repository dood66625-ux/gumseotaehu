import { easyLuckText } from "./report-extras";
/** Display-only cleanup: the immutable report and calculation evidence stay intact. */
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
  // Only this explicit authoring-template sentence is deferred; substantive limits stay in the chapter.
  body = body.replace(
    /[1-9]장의 판단은 [^.!?。\n]{1,100}주어진 근거에만 기대었느니라[.。]/g,
    (note) => {
      moved.push(note);
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

/** Plain wording for a short display excerpt; stored interpretation stays unchanged. */
export function easyTakeaway(text: string, locale: "ko" | "zh-TW") {
  if (locale === "zh-TW")
    return text
      .replace(/日主/g, "基本性格")
      .replace(/五行/g, "五種性格特色")
      .replace(/十神/g, "面對人和事的方式")
      .replace(/財星/g, "對待金錢的方式")
      .replace(/官星/g, "面對責任的方式");
  const glossary: [string, string][] = [
    ["오행의 편중", "한쪽 성향이 두드러지는 모습"],
    ["십성", "사람과 일을 대하는 모습"],
    ["일간", "기본 성격"],
    ["일주", "태어난 날을 기준으로 본 모습"],
    ["오행", "다섯 가지 성향"],
    ["재성", "돈을 대하는 모습"],
    ["관성", "책임을 대하는 모습"],
    ["인성", "배우고 도움받는 모습"],
    ["식상", "생각을 표현하는 모습"],
    ["비겁", "나와 비슷한 사람들과의 관계"],
    ["식신", "꾸준히 만들어 내는 모습"],
    ["상관", "생각을 자유롭게 말하는 모습"],
    ["비견", "나와 비슷한 사람들과 어울리는 모습"],
    ["겁재", "다른 사람과 나누고 경쟁하는 모습"],
    ["편재", "새로운 돈의 기회를 찾는 모습"],
    ["정재", "돈을 차근차근 모으는 모습"],
    ["편관", "어려운 책임을 감당하는 모습"],
    ["정관", "약속과 규칙을 지키는 모습"],
    ["편인", "새로운 방식으로 배우는 모습"],
    ["정인", "배우고 도움받는 모습"],
    ["상생", "서로 돕는 관계"],
    ["상극", "서로 부딪히는 관계"],
    ["신강", "내 기운이 강하다고 보는 풀이"],
    ["신약", "내 기운이 약하다고 보는 풀이"],
    ["용신", "균형에 도움이 된다고 보는 기운"],
    ["격국", "여러 특징을 함께 보는 풀이"],
    ["통근", "내 기운을 받쳐 주는 바탕"],
    ["투간", "겉으로 드러난 특징"],
    ["대운", "오랜 시간에 걸친 삶의 흐름"],
    ["월운", "한 달의 흐름"],
    ["세운", "한 해의 흐름"],
    ["납득하는 방식", "이해할 수 있는 방식"],
    ["도모하거라", "해 보거라"],
    ["유념하거라", "기억하거라"],
    ["숙고하거라", "천천히 생각해 보거라"],
    ["발현되", "나타나"],
    ["발현하", "나타내"],
    ["기인하", "비롯되"],
  ];
  let result = text.replace(
    "기준을 세우고 선택을 정제하는 기질을 하나의 단서로 삼되, 정해진 성격으로 받아들이지는 말거라.",
    "선택할 때 그대의 기준을 살펴보되, 성격이 정해졌다고 생각하지는 말거라.",
  );
  for (const [term, plain] of glossary)
    result = result.replace(
      new RegExp(
        "(?<![가-힣])" +
          term +
          (term === "상관" ? "(?!없이|없|이 없|하지|할)" : "") +
          "(?:[（(][\\u3400-\\u9fff\\s]+[）)])?",
        "g",
      ),
      plain,
    );
  return result
    .replace(/보시기를 권합니다(?=[.!?]|$)/g, "보거라")
    .replace(/것이 좋습니다(?=[.!?]|$)/g, "것이 좋겠구나")
    .replace(/우선순위 설정/g, "먼저 할 일 정하기");
}
/** Prefer short everyday sentences; never cut off a condition or invent a personal claim. */
export function chapterTakeaway(text: string, locale: "ko" | "zh-TW") {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  // Preserve list boundaries so a technical heading is not glued to the advice below it.
  const sentences = text.split(/\n+/).flatMap((line) => {
    const paragraph = line.replace(/\s+/g, " ").trim();
    if (!paragraph) return [];
    return typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(
            paragraph,
          ),
        ].map((s) => s.segment.trim())
      : paragraph.split(/(?<=[.!?。！？])\s+|(?<=[。！？])/u).filter(Boolean);
  });
  const practical =
    locale === "ko"
      ? /기록|살펴|살피|정해|확인|골라|돌보|보거라|하거라|말거라|두거라/
      : /記錄|留意|選擇|試著|不妨|可以|照顧/;
  const incomplete = /^(하지만|그러나|다만|반면|因此|但是|不過|然而)/;
  const jargon =
    /기운의 구성|합을|충을|간지|명리월|절입|천간|지지|기질|정제|가능성|일간|십성|재성|관성|인성|비겁|식상|신강|신약|용신|격국|통근|투간|편재|정재|상관|식신|비견|겁재|편관|정관|편인|정인|일주|대운|세운|월운|日主|十神|財星|官星|格局|用神/g;
  const ranked = sentences.map((source, i) => {
    const sentence = easyTakeaway(source, locale);
    const complex = (source.match(jargon) ?? []).length;
    return {
      sentence,
      i,
      score:
        (practical.test(source) ? 4 : 0) +
        (locale === "ko" && /(?:보거라|하거라|말거라|두거라)[.!?]$/.test(source)
          ? 4
          : 0) +
        (sentence.length >= 10 && sentence.length <= 70 ? 4 : 0) -
        (sentence.length > 120 ? 8 : 0) -
        (incomplete.test(source) ? 5 : 0) -
        (/^그대의 금서를 덮기 전에/.test(source) ? 8 : 0) -
        (!/[.!?。！？]$/.test(source) ? 4 : 0) -
        complex * 3 -
        (locale === "ko"
          ? (sentence.match(/[\u3400-\u9fff]/g) ?? []).length * 4
          : 0),
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked[0]?.sentence ?? normalized;
}

/** Keep display copy and preserved endnotes identical across browser and PDF. */
export function reportBook(report: {
  chapters: { text: string }[];
  notes?: string[];
  chart: {
    notes?: string[];
    cycles?: { age: number; startYear: number; endYear: number }[];
    target?: number;
  };
}) {
  const notes = [
    ...new Set([...(report.notes ?? []), ...(report.chart.notes ?? [])]),
  ];
  const chapters = report.chapters.map((chapter, index) => {
    const cleaned = bookText(chapter.text, notes);
    const displayText =
      index === 6
        ? easyLuckText(cleaned.text, report.chart.cycles, report.chart.target)
        : cleaned.text;
    return {
      text: displayText,
      takeaway: chapterTakeaway(displayText, "ko"),
      moved: cleaned.moved,
    };
  });
  return {
    chapters,
    notes: [...new Set([...notes, ...chapters.flatMap((c) => c.moved)])],
  };
}
