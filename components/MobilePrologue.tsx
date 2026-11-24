const scenes = [
  {
    image: "/story/scene-1.webp",
    alt: "태후가 촛불 아래에서 황제 몰래 금서를 펼쳐 점을 치는 모습",
    caption: "아주 오래전, 금기를 어기고 황제를 점치던 금서태후가 있었느니라.",
  },
  {
    image: "/story/scene-2.webp",
    alt: "금서를 품은 태후가 황궁의 군사들에게 둘러싸여 당황한 모습",
    caption:
      "그러나 누군가의 밀고로, 태후는 군사들에게 포박당할 위기에 놓였느니라.",
  },
  {
    image: "/story/scene-3.webp",
    alt: "관우신의 보호를 받으며 달빛 아래 황궁을 빠져나오는 태후",
    caption:
      "관우신의 도움으로 태후는 위기를 모면하고, 황궁을 벗어날 수 있었느니라.",
  },
  {
    image: "/story/scene-4.webp",
    alt: "외딴 집에서 펼친 보자기 위에 금서를 조심스레 내려놓는 태후",
    caption:
      "태후는 자신의 금서를 비밀리에 감싸, 세상으로부터 깊이 숨겨 두었느니라.",
  },
  {
    image: "/story/scene-5.webp",
    alt: "어둠 속 보자기 위의 봉황 문양 금서에 금빛이 다시 비치는 모습",
    caption: "그리고 지금, 금서는 그대를 통해 다시금 빛을 보게 되었으니…",
  },
];
export default function MobilePrologue() {
  return (
    <dialog
      id="mobile-prologue"
      className="mobile-prologue"
      aria-label="금서의 시작 이야기"
      aria-busy="true"
      tabIndex={-1}
    >
      <div className="prologue-scenes" aria-live="polite" aria-atomic="true">
        {scenes.map((scene, i) => (
          <figure
            className="prologue-scene"
            key={scene.image}
            hidden
            data-scene={i + 1}
          >
            <img
              data-story-src={scene.image}
              width="800"
              height="1200"
              alt={scene.alt}
              decoding="async"
            />
            <figcaption className="prologue-caption">
              {scene.caption}
            </figcaption>
          </figure>
        ))}
      </div>
      <button
        type="button"
        id="prologue-skip"
        className="prologue-skip"
        aria-label="이야기 건너뛰고 메인으로"
      >
        SKIP &gt;
      </button>
    </dialog>
  );
}
