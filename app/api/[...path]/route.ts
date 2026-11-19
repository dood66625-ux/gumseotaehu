import { confirmLiveToss } from "@/lib/toss-live-runtime";
import { requireMockPayment } from "@/lib/toss-mode";
import { externalEffectsStatus } from "@/lib/effects-status";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { all, run } from "@/lib/db";
import { audit, Fault, limit } from "@/lib/security";
import * as svc from "@/lib/service";
import {
  loginAdmin,
  requireRecentAdmin,
  revokeAdminSessions,
} from "@/lib/admin-auth";
import {
  requestEmailChange,
  localEmailChangeCode,
  confirmEmailChange,
} from "@/lib/email-change";
import { readJsonObject } from "@/lib/http-body";
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
        externalEffects: externalEffectsStatus(),
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
          purchaseEligible: r.purchaseEligible,
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
      if (p === "admin")
        return json(
          svc.adminOverview(s, req.nextUrl.searchParams.get("query") ?? ""),
        );
      if (p === "admin/export") {
        requireRecentAdmin(s, ["operations", "finance"]);
        audit(s.id, "export_masked_orders", "recent-5000");
        const rows = all(
          "SELECT id,amount,payment_status AS payment,fulfillment FROM orders ORDER BY created DESC LIMIT 5000",
        );
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
    const b = await readJsonObject(req);
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
      const token = svc.verifyOtp(
        s,
        z.string().uuid().parse(b.challengeId),
        z
          .string()
          .regex(/^\d{6}$/)
          .parse(b.code),
        true,
      );
      return setCookie(json({ ok: true }), token!);
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
        amount: svc.ownOrder(s, b.orderId as string).amount,
        localMock: true,
        close: scenario === "close",
      });
    }
    if (p === "payments/confirm") {
      if (
        process.env.TOSS_PAYMENT_MODE &&
        process.env.TOSS_PAYMENT_MODE !== "disabled"
      )
        return json(
          await confirmLiveToss(
            s,
            z.string().uuid().parse(b.orderId),
            z.string().max(200).parse(b.paymentKey),
            z.number().int().parse(b.amount),
          ),
        );
      svc.confirmPayment(
        s,
        z.string().uuid().parse(b.orderId),
        z.string().max(100).parse(b.paymentKey),
        z.number().parse(b.amount),
      );
      return json({ ok: true });
    }
    if (p === "payments/webhook") {
      requireMockPayment();
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
    if (p === "email-change/request")
      return json({
        changeId: requestEmailChange(
          s,
          z.string().uuid().parse(b.orderId),
          b.email,
        ),
      });
    if (p === "email-change/local-code")
      return json(localEmailChangeCode(s, z.string().uuid().parse(b.changeId)));
    if (p === "email-change/confirm") {
      confirmEmailChange(
        s,
        z.string().uuid().parse(b.changeId),
        z
          .string()
          .regex(/^\d{6}$/)
          .parse(b.code),
      );
      const response = json({
        ok: true,
        message: "이메일이 변경되었습니다. 새 주소로 다시 인증해 주세요.",
      });
      response.cookies.delete("gs_session");
      return response;
    }
    if (p === "tickets") return json({ id: svc.ticket(s, b) }, 201);
    if (p === "admin/login") {
      const token = loginAdmin(s, b.password, b.code);
      return setCookie(json({ ok: true }), token);
    }

    if (p.startsWith("admin/")) {
      svc.adminRequired(s);
      if (p === "admin/revoke-sessions") {
        revokeAdminSessions(s);
        const response = json({ ok: true });
        response.cookies.delete("gs_session");
        return response;
      }
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
