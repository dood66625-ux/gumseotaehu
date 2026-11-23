import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const types = {
  "empress-expressions-1.png":"image/png",
  "empress-expressions-2.png":"image/png",
  "build-info.json": "application/json; charset=utf-8",
  "index.html": "text/html; charset=utf-8",
  "refund.html": "text/html; charset=utf-8",
  "royal-v12.js": "text/javascript",
  "site.css": "text/css",
  "royal-v2.css": "text/css",
  "royal-v2.js": "text/javascript",
  "royal-v3.js": "text/javascript",
  "royal-v4.js": "text/javascript",
  "royal-v5.js": "text/javascript",
  "royal-v6.js": "text/javascript",
  "royal-v7.js": "text/javascript",
  "royal-v8.js": "text/javascript",
  "royal-v9.js": "text/javascript",
  "royal-v10.js": "text/javascript",
  "royal-v11.js": "text/javascript",
  "imperial-serif-v2.woff": "font/woff",
  "imperial-serif-v2.woff2": "font/woff2",
  "empress-royal-v2.webp": "image/webp",
  "empress-mobile-v2.webp": "image/webp",
  "empress-avatar-v2.webp": "image/webp",
  "intro.js": "text/javascript",
  "intro-v2.js": "text/javascript",
  "app.js": "text/javascript",
  "icon.svg": "image/svg+xml",
  "empress.webp": "image/webp",
  "sample-report.pdf": "application/pdf",
};
for (let i = 1; i <= 9; i++)
  types[`report-art/chapter-${String(i).padStart(2, "0")}.jpg`] = "image/jpeg";
for (const key of ["wood", "fire", "earth", "metal", "water", "garden"])
  types[`report-art/${key}.png`] = "image/png";
http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1:3200");
    const prefix = process.env.PREVIEW_BASE_PATH ?? "/gumseotaehu";
    let f =
      u.pathname === prefix + "/"
        ? "index.html"
        : u.pathname.slice(prefix.length + 1);
    if (!Object.hasOwn(types, f)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let bytes;
    try {
      bytes = readFileSync(
        resolve(process.env.PREVIEW_OUTPUT || "var/public-preview", f),
      );
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[f],
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex,nofollow",
    });
    res.end(bytes);
  })
  .listen(3200, "127.0.0.1", () =>
    console.log("Synthetic preview: http://127.0.0.1:3200/gumseotaehu/"),
  );
