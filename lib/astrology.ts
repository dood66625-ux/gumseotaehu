import { Solar, Lunar } from "lunar-javascript";
import { z } from "zod";
import { config } from "./config";
export const birthSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[가-힣a-zA-Z0-9 _-]+$/, "별명은 한글·영문·숫자로 입력해 주세요."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calendar: z.enum(["solar", "lunar"]),
  leap: z.boolean(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  sex: z.enum(["male", "female", "unspecified"]),
  place: z.literal("KR").default("KR"),
  age: z
    .enum(["under14", "14-18", "19+", "unconfirmed"])
    .default("unconfirmed"),
  self: z.literal(true),
  consent: z.literal(true),
});
export type Birth = z.infer<typeof birthSchema>;
const stems = "甲乙丙丁戊己庚辛壬癸",
  branches = "子丑寅卯辰巳午未申酉戌亥";
const stemEls = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const branchEls = [
  "수",
  "토",
  "목",
  "목",
  "토",
  "화",
  "화",
  "토",
  "금",
  "금",
  "토",
  "수",
];
const koStem = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const traits: Record<string, string> = {
  목: "새로운 것을 배우고 관계를 가꾸는",
  화: "생각을 표현하고 활력을 나누는",
  토: "일상을 정돈하고 신뢰를 쌓는",
  금: "기준을 세우고 선택을 정제하는",
  수: "깊이 관찰하고 유연하게 연결하는",
};
export function tenGod(day: string, other: string) {
  const a = stems.indexOf(day),
    b = stems.indexOf(other);
  if (a < 0 || b < 0) throw Error("INVALID_STEM");
  const d = (Math.floor(b / 2) - Math.floor(a / 2) + 5) % 5;
  return [
    ["비견", "겁재"],
    ["식신", "상관"],
    ["편재", "정재"],
    ["편관", "정관"],
    ["편인", "정인"],
  ][d][a % 2 === b % 2 ? 0 : 1];
}
export function calculate(raw: unknown) {
  const b = birthSchema.parse(raw);
  if (b.age === "under14") throw Error("만 14세 미만은 이용할 수 없습니다.");
  const [y, m, d] = b.date.split("-").map(Number);
  if (y < 1989 || y > 2030)
    throw Error("현재 검증판은 1989~2030년 한국 출생만 지원합니다.");
  let solar: any;
  if (b.calendar === "solar") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
      throw Error("올바른 날짜를 입력해 주세요.");
    if (b.leap) throw Error("윤달은 음력에만 적용됩니다.");
    solar = Solar.fromYmdHms(y, m, d, 12, 0, 0);
  } else {
    try {
      const l = Lunar.fromYmdHms(y, b.leap ? -m : m, d, 12, 0, 0);
      if (Math.abs(l.getMonth()) !== m || l.getDay() !== d) throw Error();
      solar = l.getSolar();
    } catch {
      throw Error("존재하지 않거나 검증할 수 없는 음력 날짜·윤달입니다.");
    }
  }
  const sy = solar.getYear(),
    sm = solar.getMonth(),
    sd = solar.getDay();
  const birthUtc = new Date(
    Date.UTC(
      sy,
      sm - 1,
      sd,
      ...((b.time ? b.time.split(":").map(Number) : [12, 0]) as [
        number,
        number,
      ]),
    ),
  );
  if (birthUtc.getTime() > Date.now() + 9 * 3600000)
    throw Error("미래의 출생일은 입력할 수 없습니다.");
  const [h, min] = (b.time || "12:00").split(":").map(Number);
  const local = Solar.fromYmdHms(sy, sm, sd, h, min, 0),
    eight = local.getLunar().getEightChar();
  eight.setSect(2);
  // Library solar terms use China standard time: compare +1 hour for KST year/month only.
  const chinaClock = new Date(Date.UTC(sy, sm - 1, sd, h - 1, min));
  const corrected = Solar.fromYmdHms(
    chinaClock.getUTCFullYear(),
    chinaClock.getUTCMonth() + 1,
    chinaClock.getUTCDate(),
    chinaClock.getUTCHours(),
    chinaClock.getUTCMinutes(),
    0,
  )
    .getLunar()
    .getEightChar();
  corrected.setSect(2);
  const pillars = [
    corrected.getYear(),
    corrected.getMonth(),
    eight.getDay(),
    b.time ? eight.getTime() : null,
  ] as (string | null)[];
  const counts: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars)
    if (p) {
      counts[stemEls[stems.indexOf(p[0])]]++;
      counts[branchEls[branches.indexOf(p[1])]]++;
    }
  const day = eight.getDayGan(),
    el = stemEls[stems.indexOf(day)],
    dominant = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const hidden = pillars.map((p) => (p ? getHidden(p[1]) : []));
  const relations: { type: string; pair: string }[] = [];
  for (let a = 0; a < pillars.length; a++)
    for (let j = a + 1; j < pillars.length; j++) {
      if (!pillars[a] || !pillars[j]) continue;
      const x = pillars[a]![1],
        z = pillars[j]![1];
      if ((branches.indexOf(x) + 6) % 12 === branches.indexOf(z))
        relations.push({ type: "충", pair: x + z });
      if (
        ["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"].some(
          (p) => p.includes(x) && p.includes(z) && x !== z,
        )
      )
        relations.push({ type: "육합", pair: x + z });
    }
  const luck =
    b.time && b.sex !== "unspecified"
      ? corrected.getYun(b.sex === "male" ? 1 : 0, 2)
      : null;
  const cycles: {
    pillar: string;
    age: number;
    startYear: number;
    endYear: number;
  }[] = luck
    ? luck
        .getDaYun()
        .slice(1, 9)
        .map((x: any) => ({
          pillar: x.getGanZhi(),
          age: x.getStartAge(),
          startYear: x.getStartYear(),
          endYear: x.getEndYear(),
        }))
    : [];
  const target = config().year,
    annual = Solar.fromYmdHms(target, 7, 1, 12, 0, 0)
      .getLunar()
      .getYearInGanZhiByLiChun();
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    pillar: Solar.fromYmdHms(target, i + 1, 15, 12, 0, 0)
      .getLunar()
      .getMonthInGanZhiExact(),
  }));
  const claims = [
    {
      id: `DAY_${day}`,
      text: `일간은 ${day}(${koStem[stems.indexOf(day)]}), 오행은 ${el}입니다.`,
    },
    {
      id: `COUNT_${Object.values(counts).join("")}`,
      text: `천간과 지지 본기 단순 개수는 목 ${counts.목}, 화 ${counts.화}, 토 ${counts.토}, 금 ${counts.금}, 수 ${counts.수}입니다. 계절·지장간 가중치가 아닙니다.`,
    },
    {
      id: `YEAR_${target}_${annual}`,
      text: `${target}년의 입춘 기준 세운은 ${annual}입니다.`,
    },
  ];
  return {
    pillars,
    day,
    element: el,
    dominant,
    counts,
    hidden,
    tenGods: pillars.map((p) => (p ? tenGod(day, p[0]) : null)),
    relations,
    cycles,
    direction: luck ? (luck.isForward() ? "순행" : "역행") : null,
    luckStart: luck ? luck.getStartSolar().toYmdHms() : null,
    annual,
    monthly,
    target,
    claims,
    trait: traits[el],
    solarDate: `${sy}-${String(sm).padStart(2, "0")}-${String(sd).padStart(2, "0")}`,
    notes: [
      !b.time
        ? "출생시간 미상: 시주와 대운 시작·순역을 제시하지 않습니다."
        : null,
      b.sex === "unspecified"
        ? "대운 계산 구분 미선택: 대운은 제외합니다."
        : null,
      "한국 음력·절기 독립 대조 및 전문가 검수가 완료되지 않은 로컬 검증 결과입니다.",
      "00시 일주 경계, 한국 표준시, 진태양시 미적용. 오행 개수만으로 신강·용신을 단정하지 않습니다.",
    ].filter(Boolean) as string[],
    meta: {
      engine: "lunar-javascript@1.7.8",
      rules: "geumseo-0.1",
      timezone: "KST-modern-0.1",
      ziHourPolicy: "midnight-sect2",
      solarTerms: "library-CST-plus1h-unverified",
      quality: b.time ? "known" : "unknown",
    },
  };
}
function getHidden(branch: string) {
  return (
    {
      子: ["癸"],
      丑: ["己", "癸", "辛"],
      寅: ["甲", "丙", "戊"],
      卯: ["乙"],
      辰: ["戊", "乙", "癸"],
      巳: ["丙", "戊", "庚"],
      午: ["丁", "己"],
      未: ["己", "丁", "乙"],
      申: ["庚", "壬", "戊"],
      酉: ["辛"],
      戌: ["戊", "辛", "丁"],
      亥: ["壬", "甲"],
    } as Record<string, string[]>
  )[branch];
}
export type Chart = ReturnType<typeof calculate>;

export function ageAtKstDate(solarDate: string) {
  const [y, m, d] = solarDate.split("-").map(Number),
    today = new Date(Date.now() + 9 * 3600000);
  const age =
    today.getUTCFullYear() -
    y -
    ((today.getUTCMonth() + 1) * 100 + today.getUTCDate() < m * 100 + d
      ? 1
      : 0);
  return age;
}
export function assertSubjectAge(solarDate: string) {
  if (ageAtKstDate(solarDate) < 14)
    throw Error("현재는 대상자 본인 만 14세 이상만 지원합니다.");
}
