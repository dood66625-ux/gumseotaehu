import { REPORT_WEB_PAGE_COUNT, REPORT_WEB_PAGE_NOTE } from "../lib/product";
export default function ContentGuide({ live = false }: { live?: boolean }) {
  return (
    <div className="page legal">
      <p className="eyebrow">ABOUT THE ARCHIVE</p>
      <h1>운명서와 콘텐츠 안내</h1>
      <section>
        <h2>금서태후의 이야기</h2>
        <p>
          금서태후는 이야기를 안내하는 창작 캐릭터입니다. 실제 역사 인물이나
          예언자가 아닙니다. 캐릭터 초상과 공통 그림은 AI를 활용해 제작했으며,
          각 장의 주제를 표현한 상징 이미지입니다.
        </p>
      </section>
      <section>
        <h2>계산과 해석</h2>
        <p>
          출생정보를 바탕으로 계산한 사주 기록과 해석을 구분해 제공합니다. AI로
          작성된 해석은 해당 운명서의 제공 안내에 표시합니다. 쉬운 풀이는 계산
          정보에 따른 설명과 공통 실천 안내이며 본문의 모든 해석을 대신하지
          않습니다.
        </p>
        <p>
          미래의 사건이나 성공을 확정하지 않으며 의료·법률·투자 등 전문 조언을
          대신하지 않습니다. 중요한 결정은 현실의 정보와 적절한 전문 조언을 함께
          살펴주세요.
        </p>
      </section>
      <section>
        <h2>계산의 범위</h2>
        <p>
          출생시간 등 필요한 정보가 없으면 관련 계산을 제외합니다. 오행의 단순
          개수만으로 기운의 강약이나 개인의 가치를 판단하지 않습니다.
        </p>
      </section>
      <section>
        <h2>{live ? "운명서 이용 안내" : "현재 체험 서비스"}</h2>
        <p>
          {live
            ? `종합 운명서는 22,000원 일회성 상품이며 핵심 풀이 9개 주제와 부가 풀이·자문·전체보기를 포함한 웹 ${REPORT_WEB_PAGE_COUNT}페이지 구성입니다. ${REPORT_WEB_PAGE_NOTE} 결제 확인 후 AI 해석을 작성하고, 구매 이메일 인증으로 1년간 다시 열람하며 PDF로 저장할 수 있습니다. 운명서마다 태후에게 50자 이내로 세 번 자문할 수 있으며, 답변은 이후 내려받는 PDF에도 함께 담깁니다. 문의·정정·환불은 하단 환불 정책의 이메일로 접수해주세요.`
            : "현재 공개 화면은 가상 정보로 둘러보는 체험판입니다. 심사용 TEST 결제창은 별도 경로에서 확인하며 실제 청구가 발생하지 않습니다."}
        </p>
      </section>
      <p>
        <a href="/legal/refund">환불 및 취소 규정</a>
      </p>
    </div>
  );
}
