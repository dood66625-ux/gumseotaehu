import PDFDocument from "pdfkit";
import { readingGuide } from "./report-reading-guide";
import { reportDisclosure } from "./report-disclosure";
import path from "node:path";
import { existsSync } from "node:fs";
import type { getReport } from "./service";
import { factText } from "./interpretation";
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
          Subject: reportDisclosure(data.report.provider).label,
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
    doc.fontSize(12).text(`${data.name} 님을 위한 아홉 장의 이야기`, 58, 511, {
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
        `${reportDisclosure(data.report.provider).label}\n재열람 기한 ${date(data.order.expires)}\n주문 ${data.order.id}`,
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
    const tocPage = doc.bufferedPageRange().count - 1;
    const tocRows: number[] = [];
    const starts: number[] = [];
    data.report.chapters.forEach((c, i) => {
      tocRows.push(doc.y);
      doc
        .fontSize(10)
        .fillColor(ink)
        .text(`${String(i + 1).padStart(2, "0")}     ${c.title}`, {
          lineGap: 9,
        });
    });
    data.report.chapters.forEach((c, i) => {
      doc.addPage();
      starts.push(doc.bufferedPageRange().count);
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
        .text(
          "계산 기록  " +
            c.claimIds.map((id) => factText(data.report.chart, id)).join(" "),
          { lineGap: 5 },
        );
    });
    const guide = readingGuide(data.report);
    doc.addPage();
    doc.fontSize(9).fillColor(gold).text("IN EVERYDAY WORDS");
    doc.moveDown().fontSize(23).fillColor(ink).text("쉽게 읽는 내 운명서");
    doc
      .moveDown()
      .fontSize(10)
      .text("나의 성향을 이해하고 일상에 가져갈 작은 실천", { lineGap: 6 });
    doc.image(path.resolve("public" + guide.artwork), 178, doc.y + 12, {
      width: 240,
    });
    doc.y += 200;
    doc.fontSize(13).fillColor(gold).text("내 성향, 한눈에 보기");
    doc.moveDown().fontSize(11).fillColor(ink).text(guide.lead, { lineGap: 7 });
    doc.moveDown().text("오늘의 작은 실천 · " + guide.action, { lineGap: 7 });
    doc
      .moveDown()
      .fontSize(9)
      .fillColor(gold)
      .text(
        "계산 정보에 따른 쉬운 풀이와 공통 실천 안내입니다. 개별 장의 모든 해석을 대신하지는 않습니다.",
        { lineGap: 5 },
      );
    doc.addPage();
    doc.fontSize(20).fillColor(ink).text("그래서, 어떻게 해볼까요?");
    for (const point of guide.points) {
      doc.moveDown().fontSize(12).fillColor(gold).text(point.title);
      doc
        .moveDown(0.5)
        .fontSize(10.5)
        .fillColor(ink)
        .text(point.text, { lineGap: 6 });
    }
    doc.addPage();
    doc.fontSize(20).fillColor(ink).text("어려웠던 말, 쉽게 풀어보기");
    for (const [term, meaning] of guide.glossary) {
      doc.moveDown().fontSize(12).fillColor(gold).text(term);
      doc
        .moveDown(0.5)
        .fontSize(11)
        .fillColor(ink)
        .text(meaning, { lineGap: 7 });
    }
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
        "금서태후는 창작 캐릭터이며 초상은 AI 생성 이미지입니다. " +
          reportDisclosure(data.report.provider).description,
        { lineGap: 6 },
      );
    doc.switchToPage(tocPage);
    starts.forEach((page, i) => {
      doc
        .fontSize(10)
        .fillColor(gold)
        .text(String(page), W - 102, tocRows[i], {
          width: 44,
          align: "right",
          lineBreak: false,
        });
    });
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
