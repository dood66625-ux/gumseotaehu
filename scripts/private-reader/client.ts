import { reportType } from "../../lib/report-type";
import { readingParagraphs } from "../../lib/reading-paragraphs";
import { taehouNarration } from "../../lib/taehou-narration";
import { reportFocusTopics } from "../../lib/report-focus";
import { reportTop3, easyLuckText } from "../../lib/report-extras";
import { reportClosing } from "../../lib/report-closing";
import { chapterExercise } from "../../lib/report-detail-copy";
import { readingExcerpt } from "../../lib/reading-excerpt";
import { bookText, chapterTakeaway } from "./book";
import { reportFigures } from "../../lib/report-figures";
import { reportPortrait } from "../../lib/report-portrait";
export {};
type SavedReading = {
  id: string;
  locale: "ko" | "zh-TW";
  state: string;
  created: number;
};
let savedReadings: SavedReading[] = [],
  viewVersion = 0,
  pollTimer: ReturnType<typeof setTimeout> | undefined;
type Locale = "ko" | "zh-TW";
const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
const copy = {
  ko: {
    showSaved: "내 금서 목록 보기",
    savedTitle: "내가 펼친 금서",
    savedNote:
      "같은 브라우저에서 생성 후 24시간 이내 저장본을 다시 볼 수 있느니라. 다시 열기는 추가 AI 호출이나 비용을 만들지 않느니라.",
    refresh: "저장본 목록 새로고침",
    reopen: "다시 펼치기",
    newReading: "다른 정보로 새 금서 펼치기",
    loadingSaved:
      "저장된 금서를 불러오고 있느니라. 새 AI 생성은 하지 않느니라.",
    noSaved:
      "이 브라우저에서 볼 수 있는 저장본이 없느니라. 처음 이용한 브라우저와 초대 링크를 확인해 보거라.",
    pendingSaved: "작성 중",
    heldSaved: "확인 필요",
    title: "그대의 이야기를 들려주겠느냐.",
    lead: "태어난 날과 시각을 알려주거라. 그대의 기운을 헤아려 한 권의 이야기를 펼쳐 주겠노라.",
    eyebrow: "PRIVATE AUDIENCE · 비공개 AI 풀이",
    form: "그대가 태어난 순간",
    place: "출생 지역·현지 시각",
    date: "양력 생년월일",
    time: "태어난 시각",
    sex: "대운 계산 구분",
    unknown: "태어난 시각을 모릅니다",
    consent:
      "만 19세 이상 본인이며, 입력한 출생정보로 서버에서 사주를 계산하고 계산된 사주 정보를 OpenAI에 보내 AI 해석을 생성하는 데 동의합니다. 이름·이메일·원본 생년월일은 OpenAI에 보내지 않습니다. 결과는 암호화해 24시간 기준으로 보관·정리합니다.",
    submit: "내 금서 펼치기",
    cost: "같은 접속에서 같은 정보로 다시 펼치면 저장본을 보여줍니다. 전체 비공개 체험은 최대 10회, 추정 예약액 $0.60 한도입니다.",
    range:
      "한국 출생·양력 1989년 이후를 지원합니다. 태어난 당시 한국 시각을 입력해 주세요.",
    result: "그대를 위해 펼친 금서",
    summary: "마음에 남겨 두거라",
    notes: "계산 기준과 풀이의 범위",
    print: "금서 간직하기 · 인쇄/PDF",
    aboutTitle: "비공개 체험·개인정보 안내",
    about:
      "초대 링크를 아는 사람만 접속하는 비공개 AI 체험입니다. 실제 출생정보로 계산하며 결제는 없습니다. AI 해석은 전문가 검수나 확정된 미래를 뜻하지 않습니다. 진태양시·과거 서머타임은 적용하지 않으며 경계 시각은 계산을 보류합니다. 브라우저에 입력한 원본 출생정보는 서버 계산에 사용하고 원본 입력은 DB에 저장하지 않습니다. 저장 보고서에는 계산 결과가 포함되며 암호화해 24시간 기준으로 보관·정리합니다. 링크가 노출되면 다른 사람도 새 풀이를 만들 수 있으니 재공유에 유의하세요.",
    busy: "그대의 기운을 살피고 있느니라. 잠시 기다려 보거라…",
    held: "결과 확인이 필요한 요청입니다. 중복 비용을 막기 위해 자동으로 다시 생성하지 않습니다. 운영자에게 확인해 주세요.",
    error:
      "계산하거나 결과를 가져오지 못했습니다. 날짜·지역·출생시간을 확인해 주세요. 절기 경계 시각은 임의로 확정하지 않습니다.",
    limit:
      "비공개 체험 한도에 도달했습니다. 추가 결제나 재생성은 실행하지 않았습니다.",
    adult: "이 비공개 페이지는 만 19세 이상 본인만 이용할 수 있습니다.",
    solar: "현재는 양력 생일만 지원합니다.",
    private: "비공개 초대 링크로 다시 접속해 주세요.",
    ready: "금서를 펼쳤느니라. 천천히 읽어 보거라.",
    sexOptions: ["선택하지 않음 · 대운 제외", "여성", "남성"],
    pillars: ["연주", "월주", "일주", "시주"],
    titles: [
      "사주 구조와 오행",
      "타고난 성향",
      "재물과 선택",
      "연애와 인연",
      "직업과 성장",
      "관계와 균형",
      "대운의 흐름",
      "연간·월별 흐름",
      "그대를 위한 조언",
    ],
  },
  "zh-TW": {
    showSaved: "查看我的命書列表",
    savedTitle: "我已展開的命書",
    savedNote:
      "同一瀏覽器可在產生後24小時內重開儲存結果，不會再次呼叫 AI 或增加費用。",
    refresh: "重新整理儲存列表",
    reopen: "再次展開",
    newReading: "以其他資料展開新命書",
    loadingSaved: "正在讀取已儲存的命書，不會重新產生 AI 解讀。",
    noSaved: "此瀏覽器沒有可讀取的儲存結果，請確認原先使用的瀏覽器與邀請連結。",
    pendingSaved: "撰寫中",
    heldSaved: "待確認",
    title: "且將你的故事，道與本宮聽。",
    lead: "告訴本宮你出生的日子與時辰，且讓本宮循著命盤的線索，為你展開一卷故事。",
    eyebrow: "PRIVATE AUDIENCE · 私密 AI 命書",
    form: "你來到世間的那一刻",
    place: "出生地與當地時間",
    date: "西元國曆出生日期",
    time: "出生時間",
    sex: "大運計算用性別",
    unknown: "不確定出生時間",
    consent:
      "本人已滿19歲，同意以出生資料在伺服器計算命盤，並將計算後的命盤資訊傳送至 OpenAI 產生 AI 解讀。姓名、電子信箱與原始出生日期不會傳送至 OpenAI。解讀結果加密儲存，24小時後停止提供並列入清理。",
    submit: "展開我的命書",
    cost: "同一登入工作階段、相同資料與語言會重開已儲存結果，不重複呼叫。整個私密體驗最多10次，預估預留額度共 US$0.60。更換語言重新產生會另計1次。",
    range:
      "目前僅支援國曆。韓國出生限1989年起，臺灣出生限1980年起。請填寫出生地當時的當地時間，並選擇正確地區。",
    result: "為你展開的私密命書",
    summary: "且將這句話留在心上",
    notes: "計算基準與解讀範圍",
    print: "珍藏命書 · 列印／PDF",
    aboutTitle: "私密體驗與個人資料說明",
    about:
      "這是持有邀請連結才能使用的私密 AI 體驗，以實際出生資料計算，不收取付款。AI 解讀不等於專家審核或確定的未來。本版不校正真太陽時及歷史日光節約時間；節氣交界附近會保留不確定性。原始出生資料僅用於伺服器計算，不寫入資料庫。儲存的解讀包含計算後命盤，以加密形式保留以24小時為保留基準。邀請連結外流後，其他人也可能使用額度，請勿任意轉傳。",
    busy: "本宮正細看你的命盤，且稍候片刻……",
    held: "這筆請求的結果需要確認。為避免重複費用，不會自動重新產生，請聯絡經營者確認。",
    error:
      "暫時無法計算或取得結果。請檢查國曆日期、出生地與時間；節氣交界附近不會任意判定。",
    limit: "私密體驗額度已用完。未執行額外付款或重新產生。",
    adult: "本私密頁面僅供已滿19歲的本人使用。",
    solar: "目前僅支援國曆出生日期。",
    private: "請使用私密邀請連結重新進入。",
    ready: "命書已為你展開，且慢慢讀來。",
    sexOptions: ["不指定 · 不計大運", "女", "男"],
    pillars: ["年柱", "月柱", "日柱", "時柱"],
    titles: [
      "命盤結構與五行",
      "與生俱來的氣質",
      "財務與選擇",
      "情感與緣分",
      "工作與成長",
      "人際與平衡",
      "大運的流轉",
      "流年與每月提醒",
      "本宮給你的叮嚀",
    ],
  },
};
let locale: Locale = "ko",
  busy = false;
const set = (id: string, text: string) => {
  $(id).textContent = text;
};
function language() {
  const c = copy[locale];
  document.documentElement.lang = locale;
  document.title =
    locale === "ko" ? "금서태후 · 비공개 금서" : "禁書太后 · 私密命書";
  for (const [id, key] of Object.entries({
    title: "title",
    lead: "lead",
    eyebrow: "eyebrow",
    "form-title": "form",
    "place-label": "place",
    "date-label": "date",
    "time-label": "time",
    "sex-label": "sex",
    "unknown-label": "unknown",
    "consent-label": "consent",
    submit: "submit",
    "cost-note": "cost",
    "range-note": "range",
    "result-title": "result",
    "summary-title": "summary",
    print: "print",
    "about-title": "aboutTitle",
    about: "about",
  }))
    set(id, (c as any)[key]);
  const select = $("sex") as HTMLSelectElement;
  Array.from(select.options).forEach(
    (o, i) => (o.textContent = c.sexOptions[i]),
  );
  ($("locale") as HTMLSelectElement).value = locale;
  const limit = Number(document.documentElement.dataset.callLimit ?? 10);
  set(
    "cost-note",
    c.cost
      .replace("10회", limit + "회")
      .replace("10次", limit + "次")
      .replace("0.60", (limit * 0.06).toFixed(2)),
  );
  set("show-saved", c.showSaved);
  set("saved-title", c.savedTitle);
  set("saved-note", c.savedNote);
  set("refresh-saved", c.refresh);
  set("new-reading", c.newReading);
  renderSaved();
  updatePlace();
}
function updatePlace() {
  input("date").min =
    ($("place") as HTMLSelectElement).value === "TW"
      ? "1980-01-01"
      : "1989-01-01";
  const now = new Date();
  now.setFullYear(now.getFullYear() - 19);
  input("date").max = now.toISOString().slice(0, 10);
}
const status = (s: string) => set("status", s);
function error(code: string) {
  const c = copy[locale];
  return code === "AI_SPEND_LIMIT_REACHED"
    ? c.limit
    : code === "PRIVATE_LINK_REQUIRED"
      ? c.private
      : code === "ADULT_REQUIRED"
        ? c.adult
        : code === "SOLAR_CALENDAR_REQUIRED"
          ? c.solar
          : code === "RESULT_HELD_NO_AUTOMATIC_RETRY"
            ? c.held
            : c.error;
}
function el(tag: string, text?: string, cls?: string) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
let bookPage = 0;
function pageKey() {
  return (
    "gumseo-book-page:" +
    (new URL(location.href).searchParams.get("reading") ?? "current")
  );
}
function turnPage(index: number, scroll = true) {
  const pages = [
    ...document.querySelectorAll<HTMLElement>("#chapters article"),
    $("book-ending"),
  ];
  bookPage = Math.max(0, Math.min(pages.length - 1, index));
  pages.forEach((page, i) => {
    page.hidden = i !== bookPage;
    page.classList.remove("turning");
  });
  const current = pages[bookPage];
  void current.offsetWidth;
  current.classList.add("turning");
  $("book-position").textContent = `${bookPage + 1} / ${pages.length}`;
  ($("book-prev") as HTMLButtonElement).disabled = bookPage === 0;
  ($("book-next") as HTMLButtonElement).disabled =
    bookPage === pages.length - 1;
  document.querySelectorAll("#toc a").forEach((a, i) => {
    if (i === bookPage) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  try {
    sessionStorage.setItem(pageKey(), String(bookPage));
  } catch {}
  if (scroll) {
    current.tabIndex = -1;
    current.focus({ preventScroll: true });
    $("book").scrollIntoView({ block: "start", behavior: "auto" });
  }
}
function addReadingDetails() {
  document.getElementById("reading-detail-dialog")?.remove();
  for (const page of document.querySelectorAll<HTMLElement>(
    "#chapters > article, #book-ending",
  )) {
    page
      .querySelectorAll(
        ".reading-print-full,.reading-detail-open,.private-reading-expand",
      )
      .forEach((n) => n.remove());
    const original = page.cloneNode(true) as HTMLElement;
    original.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    original.removeAttribute("id");
    original
      .querySelectorAll("details,button,.fine")
      .forEach((n) => n.remove());
    for (const p of page.querySelectorAll<HTMLParagraphElement>("p")) {
      if (
        p.closest(".chapter-takeaway") ||
        !p.textContent ||
        p.textContent.length < 100
      )
        continue;
      const text = p.textContent;
      const print = readableElement(text, p.className + " reading-print-full");
      p.after(print);
      p.classList.add("reading-brief");
      p.textContent =
        p.id === "summary"
          ? readingExcerpt(text, 120) +
            "\n\n그대의 다음 장을 기다리며, 금서태후"
          : readingExcerpt(text, 1);
    }
    const expand = document.createElement("details");
    expand.className = "private-reading-expand";
    const summary = el("summary", "글 펼치기");
    const body = el("div", undefined, "private-reading-body");
    body.tabIndex = 0;
    body.append(...original.childNodes);
    body.querySelectorAll("p").forEach((p) => {
      if ((p.textContent?.length ?? 0) > 100)
        p.replaceWith(readableElement(p.textContent!, p.className));
    });
    expand.append(summary, body);
    expand.addEventListener(
      "toggle",
      () => (summary.textContent = expand.open ? "글 접기" : "글 펼치기"),
    );
    expand.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        expand.open = false;
        summary.focus();
      }
    });
    page.append(expand);
  }
}
$("book-prev").addEventListener("click", () => turnPage(bookPage - 1));
$("book-next").addEventListener("click", () => turnPage(bookPage + 1));
$("book").addEventListener("keydown", (event) => {
  if (
    (event.target as HTMLElement).matches(
      "input,textarea,select,button,a,summary",
    ) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    turnPage(bookPage + (event.key === "ArrowRight" ? 1 : -1));
  }
});
function draw(report: any) {
  const c = copy[locale];
  $("result").hidden = false;
  $("intro").textContent =
    locale === "zh-TW"
      ? report.intro.replace(/\bfacts\b/g, "命盤依據")
      : taehouNarration(report.intro);
  let typeCard = document.getElementById("representative-type");
  if (!typeCard) {
    typeCard = el("section", undefined, "report-type");
    typeCard.id = "representative-type";
    $("intro").before(typeCard);
  }
  const type = reportType(report.chart);
  const share = el("button", "내 타입 친구에게 보여주기") as HTMLButtonElement;
  const shareStatus = el("p");
  shareStatus.setAttribute("role", "status");
  share.type = "button";
  share.addEventListener("click", async () => {
    try {
      if (navigator.share)
        await navigator.share({
          title: `금서태후 · ${type.name}`,
          text: type.shareText,
          url: type.shareUrl,
        });
      else {
        await navigator.clipboard.writeText(
          type.shareText + "\n" + type.shareUrl,
        );
        shareStatus.textContent = "타입 소개를 복사했느니라.";
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        shareStatus.textContent = "브라우저의 공유 기능을 이용해 보거라.";
    }
  });
  typeCard.replaceChildren(
    el("p", "그대의 대표 타입", "eyebrow"),
    el("h2", type.name),
    el("p", type.title),
    el("p", type.lead),
    el("p", type.tags.map((t) => "#" + t).join(" ")),
    share,
    shareStatus,
  );
  $("pillars").replaceChildren();
  report.chart.pillars.forEach((p: string | null, i: number) => {
    const card = el("div", undefined, "pillar");
    card.append(el("small", c.pillars[i]), el("strong", p ?? "—"));
    $("pillars").append(card);
  });
  $("chapters").replaceChildren();
  $("toc").replaceChildren();
  let focus = document.getElementById("report-focus");
  if (!focus) {
    focus = el("section");
    focus.id = "report-focus";
    $("toc").before(focus);
  }
  focus.replaceChildren(el("h2", "지금, 무엇이 궁금하느냐?"));
  const choices = el("div", undefined, "report-focus-buttons");
  reportFocusTopics.forEach((topic) => {
    const button = el("button", topic.label) as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      choices
        .querySelectorAll("button")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
      turnPage(topic.chapters[0]);
    });
    choices.append(button);
  });
  focus.append(choices);

  const sharedNotes = [
    ...new Set<string>([
      ...(report.notes ?? []),
      ...(report.chart.notes ?? []),
    ]),
  ];
  const movedNotes: string[] = [];
  report.chapters.forEach((chapter: any, i: number) => {
    const article = el("article");
    article.id = "chapter-" + i;
    article.className = "book-page";
    article.append(
      el("p", "第 " + "一二三四五六七八九"[i] + " 卷", "eyebrow"),
      el("h2", c.titles[i]),
    );
    const image = el("img") as HTMLImageElement;
    image.src =
      "/private-reading/chapter-" + String(i + 1).padStart(2, "0") + ".jpg";
    image.alt = c.titles[i];
    image.width = 508;
    image.height = 337;
    image.loading = "lazy";
    const cleaned = bookText(chapter.text, sharedNotes);
    cleaned.text = taehouNarration(cleaned.text);
    movedNotes.push(...cleaned.moved);
    const displayText =
      i === 6
        ? easyLuckText(cleaned.text, report.chart.cycles, report.chart.target)
        : cleaned.text;
    const takeaway = chapterTakeaway(displayText, locale);
    article.append(image);
    article.append(el("p", displayText, "chapter-copy"));
    if (locale === "ko" && i !== 6 && displayText.length < 700) {
      article.append(
        el("h3", "그대의 일상에 가져가 보거라"),
        el("p", chapterExercise(i), "chapter-copy"),
      );
    }
    if (takeaway) {
      const callout = el("aside", undefined, "chapter-takeaway");
      callout.append(
        el("span", locale === "ko" ? "이 장의 한마디" : "本章一句話"),
        el("p", takeaway),
      );
      article.append(callout);
    }
    $("chapters").append(article);
    const a = el("a", i + 1 + ". " + c.titles[i]) as HTMLAnchorElement;
    a.href = "#" + article.id;
    a.addEventListener("click", (event) => {
      event.preventDefault();
      turnPage(i);
    });
    $("toc").append(a);
  });
  const portrait = reportPortrait(report.chart.element);
  if (portrait) {
    const page = el("article", undefined, "book-page court-portrait");
    page.id = "book-portrait";
    page.append(
      el("p", "금서태후의 궁정 도감", "eyebrow"),
      el("h2", portrait.title),
      el("p", portrait.role, "court-role"),
      el("p", portrait.story),
      el("p", portrait.traits.join(" · ")),
    );
    page.append(el("h3", "오늘 곁에 둘 색"));
    const colors = el("div", undefined, "court-colors");
    for (const [name, hex] of portrait.colors) {
      const label = el("span", name),
        swatch = el("i");
      swatch.style.background = hex;
      swatch.setAttribute("aria-hidden", "true");
      label.prepend(swatch);
      colors.append(label);
    }
    page.append(
      colors,
      el("p", portrait.item),
      el("p", portrait.colorNote, "figure-note"),
    );
    page.append(el("p", portrait.note, "figure-note"));
    $("chapters").append(page);
    const link = el("a", portrait.title) as HTMLAnchorElement;
    link.href = "#book-portrait";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      turnPage(report.chapters.length);
    });
    $("toc").append(link);
  }
  const figures = reportFigures(report.chart.element, "ko");
  if (figures) {
    const page = el("article", undefined, "book-page figure-page");
    page.id = "book-figures";
    page.append(
      el("p", "人物", "eyebrow"),
      el("h2", figures.title),
      el("p", figures.lead),
    );
    for (const [i, person] of figures.people.entries()) {
      const card = el("section", undefined, "figure-card");
      card.append(
        el("span", "一二三"[i], "figure-seal"),
        el("h3", person.name),
        el("p", person.work),
        el("p", person.lesson, "figure-lesson"),
      );
      page.append(card);
    }
    $("chapters").append(page);
    const link = el("a", figures.title) as HTMLAnchorElement;
    link.href = "#book-figures";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      turnPage(report.chapters.length + (portrait ? 1 : 0));
    });
    $("toc").append(link);
  }
  const top3 = reportTop3(report.chart.element);
  if (top3) {
    for (const { title, lead, items, note } of top3.sections) {
      const index = document.querySelectorAll("#chapters > article").length;
      const page = el("article", undefined, "book-page");
      page.id = "book-top3-" + index;
      page.append(el("h2", title));
      page.append(el("p", lead, "chapter-copy"));
      items.forEach((item, rank) => {
        page.append(
          el("h3", `${rank + 1}. ${item.title}`),
          el("p", item.text, "chapter-copy"),
        );
      });
      page.append(el("p", note, "figure-note"));
      $("chapters").append(page);
      const link = el("a", title) as HTMLAnchorElement;
      link.href = "#" + page.id;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        turnPage(index);
      });
      $("toc").append(link);
    }
  }
  const ending = reportClosing(report);
  if (ending) {
    const index = document.querySelectorAll("#chapters > article").length;
    const page = el("article", undefined, "book-page");
    page.id = "book-year-reminders";
    page.append(
      el("p", ending.yearLabel, "eyebrow"),
      el("h2", ending.summaryTitle),
      el("p", ending.yearLead, "chapter-copy"),
    );
    ending.points.forEach((point, i) =>
      page.append(
        el("h3", `${i + 1}. ${point.title}`),
        el("p", point.text, "chapter-copy"),
      ),
    );
    $("chapters").append(page);
    const link = el("a", ending.summaryTitle) as HTMLAnchorElement;
    link.href = "#" + page.id;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      turnPage(index);
    });
    $("toc").append(link);
    set("summary-title", ending.letterTitle);
    set(
      "summary",
      [ending.salutation, ...ending.paragraphs, ending.signature].join("\n\n"),
    );
    $("summary").classList.add("chapter-copy");
  } else {
    set(
      "summary",
      "이 금서에서 마음에 남은 제안 하나를 골라 작은 행동으로 옮겨 보거라.",
    );
  }
  const closing = ending?.letterTitle ?? "마지막 장 · 그대에게 남기는 말";
  const closingLink = el("a", closing) as HTMLAnchorElement;
  closingLink.href = "#book-ending";
  closingLink.addEventListener("click", (event) => {
    event.preventDefault();
    turnPage(document.querySelectorAll("#chapters > article").length);
  });
  $("toc").append(closingLink);
  $("book-prev").textContent = locale === "ko" ? "← 이전 장" : "← 上一章";
  $("book-next").textContent = locale === "ko" ? "다음 장 →" : "下一章 →";
  let remembered = 0;
  try {
    remembered = Number(sessionStorage.getItem(pageKey())) || 0;
  } catch {}
  addReadingDetails();
  turnPage(Number.isInteger(remembered) ? remembered : 0, false);
  status(c.ready);
  $("birth-form").hidden = true;
  $("new-reading").hidden = false;
  $("result").scrollIntoView({ block: "start", behavior: "auto" });
}
async function showResponse(response: Response, version = viewVersion) {
  const data = await response.json();
  if (version !== viewVersion) return true;
  if (typeof data.id === "string" && /^[a-f0-9-]{36}$/.test(data.id)) {
    const address = new URL(location.href);
    address.searchParams.set("reading", data.id);
    address.hash = "";
    history.replaceState(null, "", address.pathname + address.search);
  }
  if (data.state === "ready") {
    if (data.locale && data.locale !== "ko") throw Error("NOT_FOUND");
    if (data.locale) {
      locale = "ko";
      language();
    }
    draw(data.report);
    return true;
  }
  if (data.state === "running") {
    status(copy[locale].busy);
    return false;
  }
  throw Error(data.code || "FAILED");
}
function renderSaved() {
  $("saved-readings").hidden = !savedReadings.length;
  $("saved-list").replaceChildren();
  for (const row of savedReadings.filter((row) => row.locale === "ko")) {
    const item = el("div", undefined, "saved-item");
    const label =
      (row.locale === "ko" ? "한국어" : "繁體中文") +
      " · " +
      new Date(row.created).toLocaleString(locale);
    item.append(el("p", label));
    const button = el(
      "button",
      copy[locale].reopen +
        (row.state === "running"
          ? " · " + copy[locale].pendingSaved
          : row.state === "held"
            ? " · " + copy[locale].heldSaved
            : ""),
    ) as HTMLButtonElement;
    button.type = "button";
    button.disabled = busy;
    button.addEventListener("click", () => {
      if (!busy) loadSaved(row.id);
    });
    item.append(button);
    $("saved-list").append(item);
  }
}
async function refreshSaved() {
  const response = await fetch("/private-reading/history", {
    cache: "no-store",
  });
  if (!response.ok)
    throw Error(response.status === 403 ? "PRIVATE_LINK_REQUIRED" : "FAILED");
  const data = await response.json();
  savedReadings = Array.isArray(data.readings) ? data.readings : [];
  renderSaved();
}
function cancelSaved() {
  viewVersion++;
  if (pollTimer) clearTimeout(pollTimer);
}
async function loadSaved(id?: string) {
  cancelSaved();
  const version = viewVersion;
  $("result").hidden = true;
  status(copy[locale].loadingSaved);
  const path =
    id && /^[a-f0-9-]{36}$/.test(id)
      ? "/private-reading/result/" + id
      : "/private-reading/latest";
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (version !== viewVersion) return;
    if (response.status === 404) {
      status(copy[locale].noSaved);
      return;
    }
    if (!(await showResponse(response, version)))
      pollTimer = setTimeout(() => {
        if (version === viewVersion && !busy) loadSaved(id);
      }, 2500);
  } catch (e) {
    if (version === viewVersion) status(error((e as Error).message));
  }
}
function addressReading() {
  const query = new URL(location.href).searchParams.get("reading");
  if (query && /^[a-f0-9-]{36}$/.test(query)) return query;
  return location.hash.match(/^#reading=([a-f0-9-]{36})$/)?.[1];
}
window.addEventListener("hashchange", () => {
  if (!busy && /^#reading=/.test(location.hash))
    loadSaved(location.hash.slice(9));
});
$("show-saved").addEventListener("click", () => {
  if (!busy)
    refreshSaved()
      .then(() => $("saved-readings").scrollIntoView({ block: "start" }))
      .catch((e) => status(error(e.message)));
});
$("refresh-saved").addEventListener("click", () => {
  if (!busy) refreshSaved().catch((e) => status(error(e.message)));
});
$("new-reading").addEventListener("click", () => {
  cancelSaved();
  $("birth-form").hidden = false;
  $("new-reading").hidden = true;
  $("birth-form").scrollIntoView({ block: "start" });
});
$("locale").addEventListener("change", () => {
  if (busy) return;
  locale = "ko";
  cancelSaved();
  $("result").hidden = true;
  $("birth-form").hidden = false;
  $("new-reading").hidden = true;
  language();
  status("");
});
$("place").addEventListener("change", updatePlace);
$("unknown").addEventListener("change", () => {
  input("time").disabled = input("unknown").checked;
});
let printDetails: [HTMLDetailsElement, boolean][] = [];
window.addEventListener("beforeprint", () => {
  printDetails = [
    ...document.querySelectorAll<HTMLDetailsElement>("#book-ending details"),
  ].map((node) => [node, node.open]);
  printDetails.forEach(([node]) => {
    node.open = true;
  });
});
window.addEventListener("afterprint", () => {
  printDetails.forEach(([node, open]) => {
    node.open = open;
  });
  printDetails = [];
});
$("print").addEventListener("click", () => window.print());
$("birth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  cancelSaved();
  renderSaved();
  input("submit").disabled = true;
  ($("locale") as HTMLSelectElement).disabled = true;
  status(copy[locale].busy);
  const version = viewVersion;
  try {
    const ready = await showResponse(
      await fetch("/private-reading/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          consent: input("consent").checked,
          birth: {
            name: "guest",
            date: input("date").value,
            calendar: "solar",
            leap: false,
            time: input("unknown").checked ? null : input("time").value || null,
            sex: ($("sex") as HTMLSelectElement).value,
            place: ($("place") as HTMLSelectElement).value,
            age: "19+",
            self: true,
            consent: true,
          },
        }),
      }),
      version,
    );
    if (!ready) loadSaved(addressReading());
  } catch (e) {
    if (version === viewVersion) status(error((e as Error).message));
  } finally {
    busy = false;
    refreshSaved().catch(() => {});
    input("submit").disabled = false;
    ($("locale") as HTMLSelectElement).disabled = false;
  }
});

language();
refreshSaved().catch(() => {});
loadSaved(addressReading());

window.addEventListener("pagehide", cancelSaved);

function readableElement(text: string, className = "") {
  const wrapper = el("div", undefined, "readable-text " + className);
  for (const block of readingParagraphs(text)) {
    const p = el("p");
    if (block.emphasis) {
      p.append(
        el("strong", block.emphasis),
        document.createTextNode(block.text.slice(block.emphasis.length)),
      );
    } else p.textContent = block.text;
    wrapper.append(p);
  }
  return wrapper;
}
