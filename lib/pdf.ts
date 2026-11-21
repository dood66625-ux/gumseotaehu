import { reportBook } from "./report-book";
import PDFDocument from "pdfkit";
import { chapterArt } from "./report-art";
import { readingGuide } from "./report-reading-guide";
import { reportDisclosure } from "./report-disclosure";
import { reportFigures } from "./report-figures";
import { reportPortrait } from "./report-portrait";
import path from "node:path";
import { existsSync } from "node:fs";
import type { getReport } from "./service";
export async function reportPdf(
  data: ReturnType<typeof getReport>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const book = reportBook(data.report);
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
      if (book.chapters[i].takeaway) {
        doc.moveDown(0.8).fontSize(9).fillColor(gold).text("이 장의 한마디");
        doc
          .moveDown(0.4)
          .fontSize(11)
          .fillColor(ink)
          .text(book.chapters[i].takeaway, { lineGap: 5 });
      }
      const artY = doc.y + 18;
      doc.image(path.resolve("public" + chapterArt[i].src), 58, artY, {
        width: W - 116,
        height: 170,
        fit: [W - 116, 170],
        align: "center",
        valign: "center",
      });
      doc.y = artY + 180;
      doc
        .fontSize(8)
        .fillColor(gold)
        .text(chapterArt[i].title, 58, doc.y, {
          align: "center",
          width: W - 116,
        });
      doc
        .moveDown(1.3)
        .fontSize(10.5)
        .fillColor(ink)
        .text(book.chapters[i].text, { lineGap: 7, align: "left" });
    });
    const guide = readingGuide(data.report);
    doc.addPage();
    doc.fontSize(9).fillColor(gold).text("IN EVERYDAY WORDS");
    doc.moveDown().fontSize(23).fillColor(ink).text("쉽게 읽는 내 운명서");
    doc
      .moveDown()
      .fontSize(10)
      .text("그대의 결을 이해하고, 오늘의 작은 선택으로 이어가 보거라.", {
        lineGap: 6,
      });
    doc.image(path.resolve("public" + guide.artwork), 178, doc.y + 12, {
      width: 240,
    });
    doc.y += 265;
    doc.fontSize(13).fillColor(gold).text("그대의 결을 다시 짚어 보거라");
    doc.moveDown().fontSize(11).fillColor(ink).text(guide.lead, { lineGap: 7 });
    doc
      .moveDown()
      .text("오늘은 이 한 가지를 해보거라 · " + guide.action, { lineGap: 7 });
    doc
      .moveDown()
      .fontSize(9)
      .fillColor(gold)
      .text(
        "그대의 계산 기록에 쉬운 풀이와 함께 해볼 일을 곁들였느니라. 아홉 장의 해석도 함께 돌아보거라.",
        { lineGap: 5 },
      );
    doc.addPage();
    doc.fontSize(20).fillColor(ink).text("이제, 무엇부터 해보겠느냐?");
    for (const point of guide.points) {
      doc.moveDown().fontSize(12).fillColor(gold).text(point.title);
      doc
        .moveDown(0.5)
        .fontSize(10.5)
        .fillColor(ink)
        .text(point.text, { lineGap: 6 });
    }
    doc.addPage();
    doc.fontSize(20).fillColor(ink).text("낯선 말이 있었느냐?");
    for (const [term, meaning] of guide.glossary) {
      doc.moveDown().fontSize(12).fillColor(gold).text(term);
      doc
        .moveDown(0.5)
        .fontSize(11)
        .fillColor(ink)
        .text(meaning, { lineGap: 7 });
    }
    doc.addPage();
    const courtPortrait = reportPortrait(data.report.chart.element);
    if (courtPortrait) {
      doc.fontSize(20).fillColor(ink).text(courtPortrait.title);
      doc.moveDown().fontSize(15).fillColor(gold).text(courtPortrait.role);
      doc
        .moveDown()
        .fontSize(10.5)
        .fillColor(ink)
        .text(courtPortrait.story, { lineGap: 5 });
      doc.moveDown().text(courtPortrait.traits.join(" · "));
      doc.moveDown().fontSize(13).fillColor(gold).text("오늘 곁에 둘 색");
      doc
        .moveDown()
        .fontSize(10.5)
        .fillColor(ink)
        .text(courtPortrait.colors.map(([name]) => name).join(" · "));
      doc.moveDown().text(courtPortrait.item);
      doc.moveDown().fontSize(9).text(courtPortrait.colorNote);
      doc.moveDown().fontSize(13).fillColor(gold).text("오늘의 작은 한 걸음");
      courtPortrait.actions.forEach((action) =>
        doc
          .moveDown(0.5)
          .fontSize(10.5)
          .fillColor(ink)
          .text("· " + action),
      );
      doc.moveDown().fontSize(8.5).text(courtPortrait.note);
      doc.addPage();
    }
    const figures = reportFigures(data.report.chart.element);
    if (figures) {
      doc.fontSize(20).fillColor(ink).text(figures.title);
      doc.moveDown().fontSize(10.5).text(figures.lead, { lineGap: 5 });
      figures.people.forEach((person, i) => {
        doc
          .moveDown(1.4)
          .fontSize(13)
          .fillColor(gold)
          .text(`${i + 1}. ${person.name}`);
        doc
          .moveDown(0.5)
          .fontSize(10.5)
          .fillColor(ink)
          .text(person.work, { lineGap: 5 });
        doc.moveDown(0.5).text(person.lesson, { lineGap: 5 });
      });
      doc
        .moveDown(1.5)
        .fontSize(8.5)
        .fillColor(gold)
        .text(figures.note, { lineGap: 4 });
      doc.addPage();
    }
    doc.fontSize(9).fillColor(gold).text("METHOD & NOTES");
    doc.moveDown().fontSize(21).fillColor(ink).text("계산 기준과 해석의 범위");
    doc
      .moveDown(1.3)
      .fontSize(10)
      .text(book.notes.join("\n\n"), { lineGap: 7 });
    doc
      .moveDown(1.5)
      .fontSize(9)
      .fillColor(gold)
      .text(
        "금서태후는 이야기를 안내하는 창작 캐릭터입니다. " +
          reportDisclosure(data.report.provider).description,
        { lineGap: 6 },
      );
    doc.addPage();
    doc.fontSize(9).fillColor(gold).text("CALCULATION RECORDS");
    doc.moveDown().fontSize(21).fillColor(ink).text("풀이의 계산 기록");
    doc
      .moveDown()
      .fontSize(10)
      .text(data.report.chart.claims.map((claim) => claim.text).join("\n\n"), {
        lineGap: 7,
      });
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
