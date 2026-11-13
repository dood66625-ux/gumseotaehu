import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const types = {
  "index.html": "text/html; charset=utf-8",
  "site.css": "text/css",
  "app.js": "text/javascript",
  "icon.svg": "image/svg+xml",
  "empress.webp": "image/webp",
  "sample-report.pdf": "application/pdf",
};
http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1:3200");
    let f =
      u.pathname === "/gumseotaehu/"
        ? "index.html"
        : u.pathname.replace("/gumseotaehu/", "");
    if (!Object.hasOwn(types, f)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[f],
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex,nofollow",
    });
    res.end(readFileSync(resolve("var/public-preview", f)));
  })
  .listen(3200, "127.0.0.1", () =>
    console.log("Synthetic preview: http://127.0.0.1:3200/gumseotaehu/"),
  );
