import { renderToStaticMarkup } from "react-dom/server";
import { copyFileSync, writeFileSync } from "node:fs";
import Landing from "../components/Landing";
import Shell from "../components/Shell";
const html =
  "<!doctype html>" +
  renderToStaticMarkup(
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>금서태후 | 그대의 기운을 읽다</title>
        <meta
          name="description"
          content="전통 명리학으로 나를 돌아보는 시간. 금서태후의 개인 맞춤 종합 운명서."
        />
        <link rel="icon" href="/icon.svg" />
        <link rel="stylesheet" href="/site.css" />
        <script src="/intro.js" defer />
      </head>
      <body>
        <Shell>
          <Landing />
        </Shell>
      </body>
    </html>,
  );
writeFileSync("public/landing.html", html);
copyFileSync("app/globals.css", "public/site.css");
console.log(
  "Static landing generated: zero React browser runtime; native navigation; optional 5-second story script.",
);
