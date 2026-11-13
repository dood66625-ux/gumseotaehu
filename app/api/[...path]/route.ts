import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { all, one, run } from "@/lib/db";
import {
  audit,
  equal,
  Fault,
  hash,
  limit,
  open,
  verifyTotp,
} from "@/lib/security";
import * as svc from "@/lib/service";
import { reportPdf } from "@/lib/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers });
function session(req: NextRequest) {
  const token = req.cookies.get("gs_session")?.value;
  const s = token ? svc.sessionFor(token) : null;
  if (!s) throw new Fault("세션이 만료되었습니다. 다시 시작해 주세요.", 401);
  return s;
}
function setCookie(res: NextResponse, token: string) {
  res.cookies.set("gs_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config().origin.startsWith("https:"),
    path: "/",
    maxAge: 7200,
  });
  return res;
}
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await ctx.params).path.join("/");
    if (p === "health" && req.method === "GET")
      return json({
        status: "local-mock",
        externalEffects: "disabled",
        launchReady: false,
      });
    config();
    if (req.method === "GET") {
      if (p === "session") {
        const t = req.cookies.get("gs_session")?.value,
          s = t ? svc.sessionFor(t) : null;
        return json({
          authenticated: !!s?.email_hash,
          admin: !!s && s.role !== "customer",
          mode: "local-mock",
        });
      }
      const s = session(req);
      if (p.startsWith("readings/")) {
        const r = svc.readingFor(s, p.split("/")[1]);
        return json({
          id: r.id,
          input: r.input,
          chart: r.chart,
          preview: r.preview,
        });
      }
      if (p === "orders") return json(svc.listOrders(s));
      if (/^orders\/[^/]+$/.test(p))
        return json(svc.orderView(svc.ownOrder(s, p.split("/")[1])));
      if (/^reports\/[^/]+\/pdf$/.test(p)) {
        const oid = p.split("/")[1];
        limit("pdf:" + s.id, 15);
        const report = svc.getReport(s, oid),
          buf = await reportPdf(report);
        audit(s.id, "pdf_download", oid);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="geumseo-report.pdf"',
          },
        });
      }
      if (/^reports\/[^/]+$/.test(p))
        return json(svc.getReport(s, p.split("/")[1]));
      if (p.startsWith("local-mail/"))
        return json(svc.localOtp(s, p.split("/")[1]));
      if (p === "tickets") return json(svc.getTickets(s));
      if (p === "admin") return json(svc.adminOverview(s));
      if (p === "admin/export") {
        svc.adminRequired(s, ["operations", "finance"]);
        audit(s.id, "export_masked_orders", "all");
        const rows = svc.adminOverview(s).orders;
        return new NextResponse(
          "order_id,amount_krw,payment,fulfillment\n" +
            rows
              .map((o) => [o.id, o.amount, o.payment, o.fulfillment].join(","))
              .join("\n"),
          {
            headers: {
              ...headers,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="orders.csv"',
            },
          },
        );
      }
      throw new Fault("경로를 찾을 수 없습니다.", 404);
    }
    if (req.method !== "POST")
      throw new Fault("허용되지 않은 메서드입니다.", 405);
    if (req.headers.get("origin") !== config().origin)
      throw new Fault("요청 출처를 확인할 수 없습니다.", 403);
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new Fault("JSON 요청이 필요합니다.", 415);
    if (Number(req.headers.get("content-length") || 0) > 16384)
      throw new Fault("요청이 너무 큽니다.", 413);
    const text = await req.text();
    if (Buffer.byteLength(text) > 16384)
      throw new Fault("요청이 너무 큽니다.", 413);
    let b: any;
    try {
      b = JSON.parse(text);
    } catch {
      throw new Fault("올바른 JSON이 아닙니다.");
    }
    if (p === "session") {
      const old = req.cookies.get("gs_session")?.value;
      if (old && svc.sessionFor(old)) return json({ ok: true });
      limit("session-global", 5000);
      const { token } = svc.newSession();
      return setCookie(json({ ok: true }), token);
    }
    const s = session(req);
    if (p === "logout") {
      run("DELETE FROM sessions WHERE id=?", s.id);
      const r = json({ ok: true });
      r.cookies.delete("gs_session");
      return r;
    }
    if (p === "readings") {
      limit("local-preview-host", 100, 86400000);
      return json({ id: svc.makeReading(s, b) }, 201);
    }
    if (p === "auth/request")
      return json({
        challengeId: svc.requestOtp(s, b.email),
        message:
          "주소가 올바르다면 인증 안내가 준비됩니다. 로컬에서는 시험 수신함을 확인하세요.",
      });
    if (p === "auth/verify") {
      svc.verifyOtp(
        s,
        z.string().uuid().parse(b.challengeId),
        z
          .string()
          .regex(/^\d{6}$/)
          .parse(b.code),
      );
      return json({ ok: true });
    }
    if (p === "orders")
      return json(
        {
          id: svc.createOrder(
            s,
            z.string().uuid().parse(b.readingId),
            b.consent,
          ),
        },
        201,
      );
    if (p === "payments/authenticate") {
      const scenario = z
        .enum(["success", "decline", "close"])
        .parse(b.scenario || "success");
      const key = svc.mockAuthenticate(
        s,
        z.string().uuid().parse(b.orderId),
        scenario,
      );
      return json({
        paymentKey: key,
        amount: 33000,
        localMock: true,
        close: scenario === "close",
      });
    }
    if (p === "payments/confirm") {
      svc.confirmPayment(
        s,
        z.string().uuid().parse(b.orderId),
        z.string().max(100).parse(b.paymentKey),
        z.number().parse(b.amount),
      );
      return json({ ok: true });
    }
    if (p === "payments/webhook") {
      // Treat body as untrusted notification; reconcile against independent local PG ledger.
      limit("webhook-global", 100);
      svc.reconcile();
      svc.reconcileRefunds();
      return json({ accepted: true, source: "local-pg-ledger" });
    }
    if (p === "resend") {
      svc.resend(s, z.string().uuid().parse(b.orderId));
      return json({
        message:
          "로컬 발송함에 재열람 안내를 저장했습니다. 실제 발송은 하지 않았습니다.",
      });
    }
    if (p === "tickets") return json({ id: svc.ticket(s, b) }, 201);
    if (p === "admin/login") {
      limit("admin-login-global", 15, 900000);
      limit("admin-login:" + s.id, 5, 900000);
      if (
        !equal(
          z.string().max(200).parse(b.password),
          process.env.ADMIN_PASSWORD!,
        ) ||
        !verifyTotp(
          z
            .string()
            .regex(/^\d{6}$/)
            .parse(b.code),
        )
      )
        throw new Fault("관리자 인증에 실패했습니다.", 401);
      run(
        "UPDATE sessions SET role='operations',expires=? WHERE id=?",
        Date.now() + 1800000,
        s.id,
      );
      audit(s.id, "admin_mfa_login", "local-operator");
      return json({ ok: true });
    }
    if (p.startsWith("admin/")) {
      svc.adminRequired(s);
      const oid = b.orderId ? z.string().uuid().parse(b.orderId) : "";
      if (p === "admin/retry") {
        svc.adminRetry(s, oid);
        return json({ ok: true });
      }
      if (p === "admin/refund") {
        svc.refund(
          s,
          oid,
          z.string().min(5).max(1000).parse(b.reason),
          b.testFailure === true,
        );
        return json({ ok: true });
      }
      if (p === "admin/resend") {
        svc.adminResend(s, oid);
        return json({ ok: true });
      }
      if (p === "admin/correct") {
        svc.correctBirth(
          s,
          oid,
          b.input,
          z.string().min(5).max(1000).parse(b.reason),
        );
        return json({ ok: true });
      }
      if (p === "admin/answer") {
        svc.answerTicket(
          s,
          z.string().uuid().parse(b.ticketId),
          z.string().max(2000).parse(b.message),
        );
        return json({ ok: true });
      }
      if (p === "admin/delete") {
        svc.deleteContent(
          s,
          oid,
          z.string().uuid().parse(b.ticketId),
          z.string().min(5).max(1000).parse(b.reason),
        );
        return json({ ok: true });
      }
    }
    throw new Fault("경로를 찾을 수 없습니다.", 404);
  } catch (e) {
    if (e instanceof Fault) return json({ error: e.code }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: e.issues.map((i) => i.message).join(" · ") }, 400);
    if (
      e instanceof Error &&
      /날짜|음력|만 14|지원|출생|미래|대상자|입력/.test(e.message)
    )
      return json({ error: e.message }, 400);
    return json(
      {
        error:
          "처리 중 오류가 발생했습니다. 같은 주문으로 재시도하거나 고객센터에 문의해 주세요.",
      },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
