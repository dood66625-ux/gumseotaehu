import PDFDocument from "pdfkit";
import path from "node:path";
import { existsSync } from "node:fs";
import type { getReport } from "./service";
export async function reportPdf(
  data: ReturnType<typeof getReport>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: 84, bottom: 66, left: 58, right: 58 },
        bufferPages: true,
        info: {
          Title: "금서태후 · 종합 운명서",
          Author: "금서태후",
          Subject: "가상 예시 운명서 · 규칙 기반 콘텐츠",
        },
      }),
      chunks: Buffer[] = [];
    doc.on("data", (b) => chunks.push(b));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.font(path.resolve("assets/NotoSansKR-Book.ttf"));
    const W = doc.page.width,
      H = doc.page.height,
      ink = "#443422",
      gold = "#947342",
      paper = "#F2EADD";
    function frame() {
      doc.save();
      doc.rect(0, 0, W, H).fill(paper);
      doc
        .rect(34, 31, W - 68, H - 65)
        .lineWidth(0.55)
        .stroke("#BDA77F");
      doc
        .moveTo(47, 66)
        .lineTo(W - 47, 66)
        .lineWidth(0.4)
        .stroke("#C1AE8B");
      doc.restore();
      doc
        .fontSize(7.5)
        .fillColor(gold)
        .text("GEUMSEO TAEHOU  /  PERSONAL ARCHIVE", 58, 44, {
          lineBreak: false,
        });
      doc.fillColor(ink).fontSize(10.5);
      doc.x = 58;
      doc.y = 87;
    }
    frame();
    doc.on("pageAdded", frame);
    doc
      .fontSize(9)
      .fillColor(gold)
      .text("一 人 一 書", 58, 86, { align: "center", width: W - 116 });
    const portrait = path.resolve("assets/empress-pdf-v2.jpg");
    if (existsSync(portrait)) {
      doc.image(portrait, (W - 174) / 2, 130, { width: 174, height: 218 });
      doc
        .rect((W - 184) / 2, 125, 184, 228)
        .lineWidth(0.7)
        .stroke("#A88A55");
    }
    doc
      .fontSize(55)
      .fillColor(gold)
      .text("禁  書", 58, 377, { align: "center", width: W - 116 });
    doc
      .fontSize(15)
      .fillColor(ink)
      .text("금서태후의 종합 운명서", 58, 469, {
        align: "center",
        width: W - 116,
      });
    doc
      .fontSize(12)
      .text(`${data.name} 님을 위한 아홉 장의 이야기`, 58, 511, {
        align: "center",
        width: W - 116,
      });
    const date = (v: number) =>
      new Date(v).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
    doc
      .fontSize(9)
      .fillColor(gold)
      .text(
        `${data.report.year}년 흐름 · 발행 ${date(data.created)} · 버전 ${data.order.version}`,
        58,
        560,
        { align: "center", width: W - 116 },
      );
    doc
      .fontSize(8)
      .fillColor("#71624D")
      .text(
        `가상 예시 운명서 · 규칙 기반 콘텐츠\n재열람 기한 ${date(data.order.expires)}\n주문 ${data.order.id}`,
        58,
        610,
        { align: "center", width: W - 116, lineGap: 6 },
      );
    doc.addPage();
    doc.fontSize(9).fillColor(gold).text("THE EMPRESS TO YOU");
    doc
      .moveDown(1.5)
      .fontSize(23)
      .fillColor(ink)
      .text(`${data.name} 님에게`, { lineGap: 5 });
    doc.moveDown(1.4).fontSize(12).text(data.report.intro, { lineGap: 9 });
    doc
      .moveDown(2)
      .fontSize(9)
      .fillColor(gold)
      .text("CONTENTS · 아홉 장의 기록");
    doc.moveDown(0.8);
    data.report.chapters.forEach((c, i) =>
      doc
        .fontSize(10)
        .fillColor(ink)
        .text(`${String(i + 1).padStart(2, "0")}     ${c.title}`, {
          lineGap: 9,
        }),
    );
    data.report.chapters.forEach((c, i) => {
      doc.addPage();
      doc
        .fontSize(9)
        .fillColor(gold)
        .text(`CHAPTER ${String(i + 1).padStart(2, "0")}  /  GEUMSEO TAEHOU`);
      doc
        .moveDown(0.8)
        .fontSize(23)
        .fillColor(ink)
        .text(c.title, { lineGap: 5 });
      doc
        .moveDown(1.3)
        .fontSize(10.5)
        .text(c.text, { lineGap: 7, align: "left" });
      doc
        .moveDown(1.4)
        .fontSize(8)
        .fillColor(gold)
        .text("계산 근거  " + c.claimIds.join(" · "));
    });
    doc.addPage();
    doc.fontSize(9).fillColor(gold).text("METHOD & NOTES");
    doc.moveDown().fontSize(21).fillColor(ink).text("계산 기준과 해석의 범위");
    doc
      .moveDown(1.3)
      .fontSize(10)
      .text(data.report.notes.join("\n\n"), { lineGap: 7 });
    doc
      .moveDown(1.5)
      .fontSize(9)
      .fillColor(gold)
      .text(
        "금서태후는 창작 캐릭터이며 초상은 AI 생성 이미지입니다. 이 예시 운명서는 실제 AI 해석이 아닌 규칙 기반 콘텐츠입니다. 미래의 사실을 확정하거나 의료·법률·투자 조언을 대신하지 않습니다.",
        { lineGap: 6 },
      );
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(7.5)
        .fillColor(gold)
        .text(`금서태후 · ${data.name} 님의 기록`, 58, H - 53, {
          lineBreak: false,
        });
      doc.text(
        `${String(i + 1).padStart(2, "0")} / ${pages.count}`,
        W - 105,
        H - 53,
        { lineBreak: false },
      );
    }
    doc.end();
  });
}
