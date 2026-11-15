/** Shared browser/PDF wording follows the provider on the immutable saved report. */
export function reportDisclosure(provider: string) {
  const ai = provider === "openai";
  return {
    label: ai
      ? "AI 생성 해석 · 가상 정보 검증본"
      : "가상 예시 운명서 · 규칙 기반 콘텐츠",
    description: ai
      ? "이 운명서는 만세력 계산 결과를 바탕으로 AI가 생성한 해석입니다. 가상 출생정보로 작성한 개발 검증본이며, 미래의 사실을 확정하거나 전문적인 의료·법률·투자 조언을 대신하지 않습니다."
      : "현재는 가상 정보와 규칙 기반 문장으로 구성한 예시 운명서이며 실제 AI 생성 보고서가 아닙니다. 미래의 사실을 확정하거나 전문적인 의료·법률·투자 조언을 대신하지 않습니다. 정식 서비스는 AI 생성 사실을 별도로 표시합니다.",
  };
}
