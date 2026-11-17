import { PRODUCT_PRICE_KRW } from "../lib/product";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
const reviewEnabled = process.env.PREVIEW_TOSS_TEST_REVIEW === "1";
const reviewTarget = "https://pay.gumseo.kr/";
if (reviewEnabled && process.env.PREVIEW_TOSS_REVIEW_TARGET !== reviewTarget)
  throw Error("REVIEW_TARGET_REQUIRED");
import Shell from "../components/Shell";
import RefundPolicy from "../components/RefundPolicy";
import Landing from "../components/Landing";
import { calculate } from "../lib/astrology";
import { preview, generate } from "../lib/interpretation";
import { reportPdf } from "../lib/pdf";
const out = resolve(process.env.PREVIEW_OUTPUT || "var/public-preview"),
  base = process.env.PREVIEW_BASE_PATH ?? "/gumseotaehu";
if (!["", "/gumseotaehu"].includes(base))
  throw Error("INVALID_PREVIEW_BASE_PATH");
mkdirSync(out, { recursive: true });
const input = {
  name: "가온",
  date: "1995-05-15",
  calendar: "solar",
  leap: false,
  time: "10:30",
  sex: "unspecified",
  place: "KR",
  age: "unconfirmed",
  self: true,
  consent: true,
} as const;
const chart = calculate(input),
  created = Date.now(),
  oid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const data = {
  previewBasePath: base,
  ...(reviewEnabled ? { testReviewHref: reviewTarget } : {}),
  reading: {
    id: rid,
    input,
    chart,
    preview: preview(chart),
    purchaseEligible: true,
  },
  report: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    order: {
      id: oid,
      amount: PRODUCT_PRICE_KRW,
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
    "/": base + "/?v=royal-12",
    "/start": base + "/?v=royal-12&screen=start",
    "/recover": base + "/?v=royal-12&screen=recover",
    "/help": base + "/?v=royal-12&screen=help",
    "/admin": base + "/?v=royal-12&screen=admin",
    "/checkout/fail": base + "/?v=royal-12&screen=fail",
    "/legal/terms": base + "/?v=royal-12&screen=terms",
    "/legal/privacy": base + "/?v=royal-12&screen=privacy",
    "/legal/refund": base + "/refund.html",
    "/legal/business": base + "/?v=royal-12&screen=business",
    "/reading/preview?id=": base + "/?v=royal-12&screen=preview&id=",
    "/checkout?id=": base + "/?v=royal-12&screen=checkout&id=",
    "/checkout/success?orderId=": base + "/?v=royal-12&screen=success&orderId=",
    "/report/": base + "/?v=royal-12&screen=report&id=",
    "/empress.webp": base + "/empress.webp",
    "/empress-royal-v2.webp": base + "/empress-royal-v2.webp",
    "/empress-mobile-v2.webp": base + "/empress-mobile-v2.webp",
    "/empress-avatar-v2.webp": base + "/empress-avatar-v2.webp",
  };
  return paths[s] || s;
};
const banner = "외부 미리보기 · 고정된 가상 정보 · 실제 결제·AI·이메일 없음";
await build({
  entryPoints: ["scripts/public-preview/entry.tsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  outfile: resolve(out, "royal-v12.js"),
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
                'useState((window as any).__GEUMSEO_PREVIEW_EMAIL || "preview@example.invalid"),\n    [challenge',
              )
              .replace('id="buyer-email"', 'id="buyer-email" readOnly');
          if (args.path.endsWith("EmailChange.tsx"))
            s = s.replace(
              'name="newEmail"',
              'name="newEmail" defaultValue="preview-corrected@example.invalid" readOnly',
            );
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
    {reviewEnabled && (
      <section className="page" aria-label="심사용 테스트 결제" style={{ marginBottom: 40 }}>
        <div className="card">
          <h2>심사용 토스 테스트 결제</h2>
          <p>
            가상 주문으로 카드 결제창을 확인합니다. 실제 청구와 유료 운명서 제공은
            활성화하지 않습니다.
          </p>
          <a className="button" href={reviewTarget}>
            토스 카드 결제창 확인
          </a>
        </div>
      </section>
    )}
  </Shell>,
)
  .replaceAll("로컬 검증판 · 실제 결제·AI 호출·이메일 발송 없음", banner)
  .replace(
    /(href|src|srcset)="(\/[^\"]*)"/gi,
    (m, attr, p) => `${attr}="${route(p)}"`,
  );
const serialized = JSON.stringify(data).replaceAll("<", "\\u003c");
const refund = renderToStaticMarkup(
  <Shell>
    <RefundPolicy />
  </Shell>,
).replace(
  /(href|src|srcset)="(\/[^\"]*)"/gi,
  (m, attr, p) => `${attr}="${route(p)}"`,
);
writeFileSync(
  resolve(out, "refund.html"),
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>환불 및 취소 규정 | 금서태후</title><link rel="stylesheet" href="${base}/royal-v2.css"></head><body>${refund}</body></html>`,
);
writeFileSync(
  resolve(out, "index.html"),
  `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>금서태후 · 그대의 운명을 펼치다</title><link rel="stylesheet" href="${base}/royal-v2.css"><link rel="icon" href="${base}/icon.svg"><script>if(new URLSearchParams(location.search).has('screen'))document.documentElement.dataset.view='inner';</script><style>#app>.loading{display:none}html[data-view=inner] #home{display:none}html[data-view=inner] #app>.loading{display:block}</style></head><body><div id="home">${home}</div><div id="app"><div class="loading" role="status"><span>禁</span>그대의 금서를 펼치고 있습니다.</div></div><script id="preview-data" type="application/json">${serialized}</script><script type="module">if(new URLSearchParams(location.search).has('screen'))import('${base}/royal-v12.js');</script><script defer src="${base}/intro-v2.js"></script></body></html>`,
);

for (const file of [
  "empress.webp",
  "icon.svg",
  "empress-royal-v2.webp",
  "empress-mobile-v2.webp",
  "empress-avatar-v2.webp",
  "imperial-serif-v2.woff2",
  "intro.js",
])
  copyFileSync("public/" + file, resolve(out, file));
writeFileSync(
  resolve(out, "royal-v2.css"),
  readFileSync("app/globals.css", "utf8").replace(
    /url\((['"]?)\//g,
    (_m, q) => `url(${q}${base}/`,
  ),
);
copyFileSync("public/intro.js", resolve(out, "intro-v2.js"));
writeFileSync(resolve(out, ".nojekyll"), "");
console.log("Synthetic-only static preview built:", out);
