import {expect,it} from "vitest";
import {reportDisclosure} from "../lib/report-disclosure";
it("does not infer synthetic birth information from the AI provider alone",()=>{
 const d=reportDisclosure("openai");
 expect(d.description).toContain("AI가 생성한 해석");
 expect(d.label+d.description).not.toMatch(/가상|개발 검증본/);
 expect(d.description).toContain("미래의 사실을 확정하거나");
});
it("continues to identify rule-based preview reports as synthetic examples",()=>{
 const d=reportDisclosure("local-rule-mock");expect(d.label).toContain("가상 예시");expect(d.description).toContain("실제 AI 생성 보고서가 아닙니다");
});
