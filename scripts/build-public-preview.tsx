import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import Shell from "../components/Shell";
import Landing from "../components/Landing";
import { calculate } from "../lib/astrology";
import { preview, generate } from "../lib/interpretation";
import { reportPdf } from "../lib/pdf";
const out = resolve(process.env.PREVIEW_OUTPUT || "var/public-preview"),
  base = "/gumseotaehu";
mkdirSync(out, { recursive: true });
const input = {
  name: "가온",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "unspecified",
  place: "KR",
  age: "19+",
  self: true,
  consent: true,
} as const;
const chart = calculate(input),
  created = Date.now(),
  oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const data = {
  reading: { id: rid, input, chart, preview: preview(chart) },
  report: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    order: {
      id: oid,
      amount: 33000,
      payment: "paid",
      fulfillment: "ready",
      version: 1,
      deleted: false,
      created,
      expires: created + 365 * 86400000,
    },
    name: input.name,
    birth: input,
    created,
    report: generate(chart),
  },
};
writeFileSync(resolve(out, "sample-report.pdf"), await reportPdf(data.report));
const route = (s: string) => {
  const paths: Record<string, string> = {
    "/": base + "/",
    "/start": base + "/?screen=start",
    "/recover": base + "/?screen=recover",
    "/help": base + "/?screen=help",
    "/admin": base + "/?screen=admin",
    "/checkout/fail": base + "/?screen=fail",
    "/legal/terms": base + "/?screen=terms",
    "/legal/privacy": base + "/?screen=privacy",
    "/legal/refund": base + "/?screen=refund",
    "/legal/business": base + "/?screen=business",
    "/reading/preview?id=": base + "/?screen=preview&id=",
    "/checkout?id=": base + "/?screen=checkout&id=",
    "/checkout/success?orderId=": base + "/?screen=success&orderId=",
    "/report/": base + "/?screen=report&id=",
    "/empress.webp": base + "/empress.webp",
  };
  return paths[s] || s;
};
const banner = "외부 미리보기 · 고정된 가상 정보 · 실제 결제·AI·이메일 없음";
await build({
  entryPoints: ["scripts/public-preview/entry.tsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  outfile: resolve(out, "app.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "preview-only-adapter",
      setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "link",
          namespace: "preview",
        }));
        b.onLoad({ filter: /.*/, namespace: "preview" }, () => ({
          contents:
            'import React from "react";export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
        b.onLoad({ filter: /components\/.*\.tsx$/ }, (args) => {
          let s = readFileSync(args.path, "utf8");
          s = s.replace(/"(\/[^"\n]*)"/g, (m, p) => JSON.stringify(route(p)));
          s = s.replace(
            "로컬 검증판 · 실제 결제·AI 호출·이메일 발송 없음",
            banner,
          );
          if (args.path.endsWith("StartForm.tsx")) {
            s = s
              .replace(
                'name="name"',
                'name="name" defaultValue="가온" readOnly',
              )
              .replace(
                'name="date"',
                'name="date" defaultValue="1995-05-15" readOnly',
              )
              .replace(
                'name="time"',
                'name="time" defaultValue="10:30" readOnly',
              )
              .replace('id="calendar"', 'id="calendar" disabled')
              .replace('id="sex"', 'id="sex" disabled')
              .replace("checked={unknown}", "checked={unknown} disabled");
          }
          if (args.path.endsWith("client.tsx"))
            s = s
              .replace(
                'useState(""),\n    [challenge',
                'useState("preview@example.invalid"),\n    [challenge',
              )
              .replace('id="buyer-email"', 'id="buyer-email" readOnly');
          if (args.path.endsWith("Help.tsx"))
            s = s.replace(
              'name="message"',
              'name="message" readOnly defaultValue="가상 미리보기 문의입니다. 실제 상담 접수가 아닙니다."',
            );
          return {
            contents: s,
            loader: "tsx",
            resolveDir: resolve(args.path, ".."),
          };
        });
      },
    },
  ],
});
let home = renderToStaticMarkup(
  <Shell>
    <Landing />
  </Shell>,
)
  .replaceAll("로컬 검증판 · 실제 결제·AI 호출·이메일 발송 없음", banner)
  .replace(/href="(\/[^\"]*)"/g, (m, p) => `href="${route(p)}"`);
writeFileSync(
  resolve(out, "index.html"),
  '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>금서태후 · 가상 정보 미리보기</title><link rel="stylesheet" href="' +
    base +
    '/site.css"><link rel="icon" href="' +
    base +
    '/icon.svg"></head><body><div id="home">' +
    home +
    '</div><div id="app"></div><script id="preview-data" type="application/json">' +
    JSON.stringify(data).replaceAll("<", "\\u003c") +
    '</script><script type="module" src="' +
    base +
    '/app.js"></script></body></html>',
);
for (const file of ["empress.webp", "icon.svg"])
  copyFileSync("public/" + file, resolve(out, file));
copyFileSync("app/globals.css", resolve(out, "site.css"));
writeFileSync(resolve(out, ".nojekyll"), "");
console.log("Synthetic-only static preview built:", out);
