/** Loopback-only synthetic QA boundary. Never registered in the public Next.js app. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readJsonObject } from "../http-body";
import { Fault } from "../security";
import { PRODUCT_PRICE_KRW } from "../product";
export type SandboxBackend = {
  state(): unknown;
  confirm(key: string, amount: number): Promise<unknown>;
  recover(): Promise<unknown>;
  login(password: string, code: string): void;
  refund(): Promise<unknown>;
  pdf(): Promise<Buffer>;
};
const page = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>금서태후 · 토스 테스트</title><link rel="stylesheet" href="/style.css"><main><p>禁書太后 · 개발자 전용</p><h1>테스트 결제 확인</h1><p>가상 주문 22,000원 · 실제 청구 없음</p><p>가상 고객만 사용합니다. 실제 개인정보나 카드번호를 입력하지 마세요.</p><p id="status" role="status" aria-live="polite">주문을 확인하고 있습니다.</p><pre id="order"></pre><button id="load">토스 테스트 결제수단 불러오기</button><div id="methods"></div><div id="agreement"></div><button id="pay" disabled>22,000원 테스트 결제</button><button id="recover">추가 결제 없이 상태 재조회</button><a href="/pdf">작성된 테스트 PDF 다운로드</a><hr><h2>관리자 · 테스트 전액 취소</h2><form id="login"><label>관리자 비밀번호<input id="password" type="password" maxlength="200" autocomplete="current-password" required></label><label>관리자 인증코드<input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button>관리자 인증</button></form><button id="refund" disabled>이 가상 주문 전액 취소</button><p><a href="/">현재 주문 다시 확인</a></p></main><script type="module" src="/client.mjs"></script></html>`;
const css = `*{box-sizing:border-box}body{margin:0;padding:24px;background:#171511;color:#f5ead3;font:16px/1.7 system-ui}main{max-width:620px;margin:auto}button,input{padding:14px;width:100%;margin:10px 0;font:inherit;border-radius:8px}button{background:#e2c38a;color:#171511;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#e2c38a}#status{min-height:3em}`;
export function createTossSandboxHandler(options: {
  origin: string;
  clientKey: string;
  merchantConfigured: boolean;
  backend: SandboxBackend;
  clientScript: string;
}) {
  const origin = new URL(options.origin);
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    origin.origin !== options.origin
  )
    throw Error("LOOPBACK_ORIGIN_REQUIRED");
  if (!/^test_gck_[A-Za-z0-9_]+$/.test(options.clientKey))
    throw Error("WIDGET_TEST_CLIENT_REQUIRED");
  const gate = randomBytes(32).toString("hex");
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
    // Only this isolated QA origin permits provider resources. Main app CSP stays unchanged.
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self' https://js.tosspayments.com; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self' https://*.tosspayments.com https://*.toss.im; frame-src https://*.tosspayments.com https://*.toss.im; img-src 'self' data: https://*.tosspayments.com https://*.toss.im; font-src 'self' https://*.tosspayments.com; base-uri 'none'; form-action 'self' https://*.tosspayments.com https://*.toss.im; frame-ancestors 'none'",
  };
  function response(
    body: BodyInit | null,
    status = 200,
    type = "application/json",
  ) {
    return new Response(body, {
      status,
      headers: { ...headers, "Content-Type": type },
    });
  }
  const json = (data: unknown, status = 200) =>
    response(JSON.stringify(data), status);
  return async (req: Request) => {
    try {
      const url = new URL(req.url);
      if (
        url.origin !== options.origin ||
        req.headers.get("host") !== origin.host
      )
        return json({ error: "로컬 접속만 허용합니다." }, 403);
      if (
        req.headers.get("sec-fetch-site") === "cross-site" &&
        !["/success", "/fail"].includes(url.pathname)
      )
        return json({ error: "외부 사이트 요청은 차단됩니다." }, 403);
      if (
        req.method === "GET" &&
        ["/", "/success", "/fail", "/admin"].includes(url.pathname)
      ) {
        const adminPage = url.pathname === "/admin";
        const content = adminPage
          ? page.replace(
              /<button id="load">.*?<hr>/,
              '<button id="recover">추가 결제 없이 상태 재조회</button><hr>',
            )
          : page.replace(
              /<hr><h2>.*?<p><a href="\/">/,
              '<p><a href="/admin">관리자 취소 화면</a></p><p><a href="/">',
            );
        const res = response(content, 200, "text/html; charset=utf-8");
        // Admin credentials are entered in a fresh document without any provider script.
        if (adminPage)
          res.headers.set(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
          );
        // Lax permits top-level GET return from the payment provider; POST still requires exact Origin.
        if (url.pathname === "/")
          res.headers.set(
            "Set-Cookie",
            `gs_toss_qa=${gate}; HttpOnly; SameSite=Lax; Path=/`,
          );
        return res;
      }
      const cookie =
        req.headers
          .get("cookie")
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("gs_toss_qa="))
          ?.slice(11) ?? "";
      if (
        cookie.length !== gate.length ||
        !timingSafeEqual(Buffer.from(cookie), Buffer.from(gate))
      )
        return json({ error: "로컬 시험 화면에서 다시 시작해 주세요." }, 401);
      if (req.method === "GET") {
        if (url.pathname === "/client.mjs")
          return response(
            options.clientScript,
            200,
            "text/javascript; charset=utf-8",
          );
        if (url.pathname === "/style.css")
          return response(css, 200, "text/css; charset=utf-8");
        if (url.pathname === "/state")
          return json({
            order: options.backend.state(),
            clientKey: options.clientKey,
            merchantConfigured: options.merchantConfigured,
            amount: PRODUCT_PRICE_KRW,
          });
        if (url.pathname === "/pdf") {
          const pdf = response(
            new Uint8Array(await options.backend.pdf()),
            200,
            "application/pdf",
          );
          pdf.headers.set(
            "Content-Disposition",
            'attachment; filename="gumseo-synthetic-report.pdf"',
          );
          return pdf;
        }
      }
      if (req.method !== "POST")
        return json({ error: "경로를 찾을 수 없습니다." }, 404);
      if (req.headers.get("origin") !== options.origin)
        return json({ error: "요청 출처가 다릅니다." }, 403);
      if (req.headers.get("content-type")?.split(";")[0] !== "application/json")
        return json({ error: "JSON 요청이 필요합니다." }, 415);
      const b = await readJsonObject(req, 2048);
      if (url.pathname === "/login") {
        const data = z
          .object({
            password: z.string().max(200),
            code: z.string().regex(/^\d{6}$/),
          })
          .strict()
          .parse(b);
        options.backend.login(data.password, data.code);
        return json({ ok: true });
      }
      if (!options.merchantConfigured)
        return json(
          { error: "상점아이디(MID) 설정 후 승인·조회·취소할 수 있습니다." },
          503,
        );
      if (url.pathname === "/confirm") {
        const data = z
          .object({
            orderId: z.string().uuid(),
            paymentKey: z
              .string()
              .min(1)
              .max(200)
              .refine((v) => !/[\x00-\x1f\x7f]/.test(v)),
            amount: z.literal(PRODUCT_PRICE_KRW),
          })
          .strict()
          .parse(b);
        const current = options.backend.state() as { id: string };
        if (current.id !== data.orderId)
          return json({ error: "현재 가상 주문과 다릅니다." }, 409);
        return json(
          await options.backend.confirm(data.paymentKey, data.amount),
        );
      }
      z.object({}).strict().parse(b);
      if (url.pathname === "/recover")
        return json(await options.backend.recover());
      if (url.pathname === "/refund")
        return json(await options.backend.refund());
      return json({ error: "경로를 찾을 수 없습니다." }, 404);
    } catch (e) {
      if (e instanceof Fault) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError)
        return json({ error: "테스트 요청 값을 확인해 주세요." }, 400);
      return json(
        {
          error:
            "시험 작업을 완료하지 못했습니다. 추가 결제 없이 상태를 확인해 주세요.",
        },
        503,
      );
    }
  };
}
