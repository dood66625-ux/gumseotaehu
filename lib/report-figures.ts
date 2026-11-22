/** Korean historical figures: editorial analogies, never birth-chart matching. */
type Pair = readonly [string, string];
type Figure = { name: string; work: string; lesson: string };
const figures: Record<string, Figure[]> = {
  목: [
    {
      name: "세종대왕",
      work: "훈민정음을 창제하고 학문과 기술의 발전을 이끌었느니라.",
      lesson: "배운 것을 나누면 함께 자랄 수 있느니라.",
    },
    {
      name: "이이",
      work: "학문을 연구하고 교육과 제도를 고칠 방안을 제안했느니라.",
      lesson: "배운 것 하나를 오늘 생활에서 써 보거라.",
    },
    {
      name: "이황",
      work: "학문을 깊이 연구하고 제자를 가르치는 데 힘썼느니라.",
      lesson: "서두르지 말고 그대만의 속도로 배워 보거라.",
    },
  ],
  화: [
    {
      name: "허난설헌",
      work: "자신의 마음과 삶을 섬세한 시로 표현했느니라.",
      lesson: "마음속 생각을 그대만의 말로 남겨 보거라.",
    },
    {
      name: "김홍도",
      work: "사람들의 일상과 다양한 모습을 그림으로 남겼느니라.",
      lesson: "평범한 하루에서도 재미있는 장면을 찾아보거라.",
    },
    {
      name: "신사임당",
      work: "풀과 벌레 등 주변 자연을 그림에 담았느니라.",
      lesson: "작은 아름다움을 발견하면 그림이나 글로 남겨 보거라.",
    },
  ],
  토: [
    {
      name: "정약용",
      work: "사람들의 생활에 도움이 되는 제도와 학문을 고민했느니라.",
      lesson: "큰 계획도 오늘 할 수 있는 한 가지부터 시작하거라.",
    },
    {
      name: "김만덕",
      work: "제주에 큰 흉년이 들었을 때 재산을 내어 구휼을 도왔느니라.",
      lesson: "그대가 할 수 있는 작은 도움부터 나누어 보거라.",
    },
    {
      name: "이원익",
      work: "오랜 공직 생활 동안 백성의 부담을 줄이는 제도에 힘썼느니라.",
      lesson: "함께하는 사람이 덜 힘들 방법을 찾아보거라.",
    },
  ],
  금: [
    {
      name: "장영실",
      work: "시간과 날씨를 살피는 기구를 만드는 데 힘썼느니라.",
      lesson: "불편한 점 하나를 고치는 데서 좋은 생각이 시작되느니라.",
    },
    {
      name: "이순신",
      work: "전쟁 속에서 수군을 이끌며 준비와 기록을 이어갔느니라.",
      lesson: "어려운 일일수록 준비할 것부터 하나씩 살펴보거라.",
    },
    {
      name: "정조",
      work: "규장각을 통해 학문을 장려하고 인재를 길렀느니라.",
      lesson: "좋은 생각은 꼼꼼히 살피고 함께 다듬어 보거라.",
    },
  ],
  수: [
    {
      name: "김정호",
      work: "지도와 지리 정보를 정리하여 대동여지도를 펴냈느니라.",
      lesson: "궁금한 것을 적고 차근차근 확인해 보거라.",
    },
    {
      name: "윤동주",
      work: "자신의 마음과 삶을 돌아보는 시를 남겼느니라.",
      lesson: "조용히 마음을 적어 보면 지금 필요한 것이 보일 수 있느니라.",
    },
    {
      name: "허준",
      work: "의학 지식을 모아 동의보감을 편찬했느니라.",
      lesson: "여러 정보를 살핀 뒤 중요한 것을 쉽게 정리해 보거라.",
    },
  ],
};
const themes: Record<string, Pair> = {
  목: [
    "나무가 자라듯 배우고 함께 성장하는 이야기",
    "像樹木一樣學習，陪伴彼此成長的故事",
  ],
  화: [
    "불빛처럼 마음을 표현하고 온기를 나누는 이야기",
    "像光一樣表達感受，分享溫暖的故事",
  ],
  토: [
    "땅처럼 차근차근 쌓고 곁을 지키는 이야기",
    "像土地一樣慢慢累積，安穩陪伴的故事",
  ],
  금: [
    "좋은 도구처럼 꼼꼼히 살피고 다듬는 이야기",
    "像好工具一樣仔細觀察、反覆打磨的故事",
  ],
  수: [
    "물처럼 깊이 살피고 자기 길을 찾는 이야기",
    "像水一樣深入觀察，尋找自己道路的故事",
  ],
};
/** Legacy locale argument is accepted; current editorial content is Korean only. */
export function reportFigures(
  element: unknown,
  _locale: "ko" | "zh-TW" = "ko",
) {
  if (typeof element !== "string" || !Object.hasOwn(figures, element))
    return null;
  return {
    title: "그대의 기질을 비추는 세 인물",
    lead: themes[element][0] + "이니라. 닮고 싶은 모습 하나를 골라 보거라.",
    note: "인물의 실제 사주 일치도가 아니라, 일간 오행의 상징과 공개된 활동을 연결한 이야기입니다.",
    people: figures[element].map((person) => ({ ...person })),
  };
}
