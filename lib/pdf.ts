import PDFDocument from "pdfkit";
import path from "node:path";
import type { getReport } from "./service";
export async function reportPdf(
  data: ReturnType<typeof getReport>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 54, bottom: 58, left: 50, right: 50 },
      bufferPages: true,
      info: { Title: "금서태후 종합 운명서", Author: "금서태후 · 로컬 검증판" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (b) => chunks.push(b));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.font(path.resolve("assets/NotoSansKR.ttf"));
    doc.fontSize(22).text("금서태후 · 종합 운명서");
    doc
      .moveDown()
      .fontSize(11)
      .text(
        `${data.name} 님 | ${data.report.year}년 | 주문 ${data.order.id}\n발행 ${new Date(data.created).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}\n버전 ${data.order.version} · 로컬 규칙 기반 모의 콘텐츠\n열람 기한 ${new Date(data.order.expires).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`,
      );
    doc.moveDown().text(data.report.intro);
    for (const c of data.report.chapters) {
      doc.addPage();
      doc.fontSize(18).text(c.title);
      doc.moveDown().fontSize(11).text(c.text, { lineGap: 6 });
      doc
        .moveDown()
        .fontSize(9)
        .fillColor("#555555")
        .text("계산 근거: " + c.claimIds.join(", "))
        .fillColor("#000000");
    }
    doc.addPage().fontSize(12).text("계산 기준과 유의사항");
    doc.moveDown().fontSize(10).text(data.report.notes.join("\n\n"));
    doc
      .moveDown()
      .text(
        "전통 해석 참고자료이며 미래를 확정하지 않습니다. 본 시험판은 실제 AI를 호출하지 않습니다.",
      );
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .text(`금서태후 · ${i + 1} / ${pages.count}`, 50, 800, {
          lineBreak: false,
        });
    }
    doc.end();
  });
}
