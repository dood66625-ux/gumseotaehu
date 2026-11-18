/** Bundled, shared illustrations. These are symbolic artwork, never personal predictions. */
export const chapterArt = [
  {
    title: "기운이 머무는 정원",
    alt: "소나무와 태호석, 햇살과 물길이 어우러진 중국식 정원",
  },
  { title: "나답게 피어나는 시간", alt: "따뜻한 해돋이 앞에 피어난 목련" },
  { title: "차곡차곡 가꾸는 일상", alt: "맑은 물길 옆에 익어가는 황금빛 들판" },
  {
    title: "서로를 바라보는 마음",
    alt: "꽃이 핀 연못 곁에 함께 선 두 마리 학",
  },
  {
    title: "한 걸음씩, 더 넓은 곳으로",
    alt: "꽃이 핀 정원의 돌계단과 중국식 정자",
  },
  {
    title: "다른 빛이 어우러질 때",
    alt: "중국식 둥근 월문 너머로 꽃과 나무가 어우러진 정원",
  },
  {
    title: "나만의 속도로 흐르기",
    alt: "겹겹의 산 사이로 길게 이어지는 빛나는 강",
  },
  {
    title: "계절마다 다른 아름다움",
    alt: "봄꽃과 여름 녹음, 가을 단풍과 겨울 설경을 담은 원형 정원",
  },
  { title: "다음 장은 그대의 손으로", alt: "연꽃 곁에 펼쳐진 따뜻한 금빛 책" },
].map((art, index) => ({
  ...art,
  src: `/report-art/chapter-${String(index + 1).padStart(2, "0")}.jpg`,
}));
