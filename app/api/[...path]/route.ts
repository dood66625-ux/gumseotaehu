import {
  readCounsel,
  queueCounsel,
  counselEntries,
} from "@/lib/taehou-counsel";
import { checkAdminPassword, setAdminPassword } from "@/lib/admin-password";
import { excludeAdminVisit } from "@/lib/visit-network";
import { protectProxyRequest } from "@/lib/proxy-access";
import {
  confirmLiveToss,
  liveCheckoutInfo,
  checkoutMode,
  manageLiveRefund,
  livePurchaseReceipt,
} from "@/lib/toss-live-runtime";
import { requireMockPayment, isLiveTossOrder } from "@/lib/toss-mode";
import { externalEffectsStatus } from "@/lib/effects-status";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { all, run, db, one } from "@/lib/db";
import { audit, Fault, limit, open } from "@/lib/security";
import {
  linkVisitReading,
  visitorOverview,
  visitorSummary,
  visitorCookie,
} from "@/lib/visitor-log";
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
function setCookie(res: NextResponse, token: string, req: NextRequest) {
  res.cookies.set("gs_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      config().origin.startsWith("https:") ||
      req.headers.get("origin") === "https://gumseo.kr",
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
    protectProxyRequest(req.headers, p, req.method);
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
      if (p === "admin/visitors") {
        requireRecentAdmin(s, ["operations"]);
        const page = z.coerce
          .number()
          .int()
          .min(0)
          .max(1000)
          .parse(req.nextUrl.searchParams.get("page") ?? 0);
        const sort = z
          .enum(["recent", "repeat"])
          .parse(req.nextUrl.searchParams.get("sort") ?? "recent");
        const result = visitorOverview(db(), page, Date.now(), sort);
        return json({
          ...result,
          summary: visitorSummary(db()),
          visits: result.visits.map((v) => ({
            ...v,
            orders: v.orders
              .filter((o) => isLiveTossOrder(String(o.id)))
              .map((o) => ({
                ...o,
                live: isLiveTossOrder(String(o.id)),
              })),
          })),
        });
      }
      if (/^admin\/visitor-report\/[^/]+$/.test(p)) {
        requireRecentAdmin(s, ["operations"]);
        const id = z.string().uuid().parse(p.split("/")[2]);
        const row = one(
          "SELECT o.id,o.version,o.payment_status,o.paid_at,o.content_deleted,o.expires,r.payload,r.created,i.input_enc FROM orders o JOIN reports r ON r.order_id=o.id AND r.version=o.version JOIN readings i ON i.id=o.reading_id WHERE o.id=?",
          id,
        );
        if (!row || !row.paid_at)
          throw new Fault("구매 운명서를 찾을 수 없습니다.", 404);
        if (row.content_deleted || !row.expires || row.expires < Date.now())
          throw new Fault("보관 기간이 끝났거나 삭제된 운명서입니다.", 410);
        const report = open(row.payload);
        if (!report) throw new Fault("삭제된 운명서입니다.", 410);
        audit(s.id, "admin_report_view", id);
        return json({
          orderId: id,
          name: open(row.input_enc)?.name ?? "",
          version: row.version,
          created: row.created,
          payment: row.payment_status,
          live: isLiveTossOrder(id),
          report,
        });
      }
      if (p === "payments/config") return json(checkoutMode());
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
      if (/^orders\/[^/]+\/receipt$/.test(p))
        return json(
          await livePurchaseReceipt(
            s,
            z.string().uuid().parse(p.split("/")[1]),
          ),
        );
      if (/^orders\/[^/]+$/.test(p))
        return json(svc.orderStatusView(s, p.split("/")[1]));
      if (/^reports\/[^/]+\/pdf$/.test(p)) {
        const oid = p.split("/")[1];
        limit("pdf:" + s.id, 15);
        const report = svc.getReport(s, oid),
          buf = await reportPdf({ ...report, counsel: counselEntries(oid) });
        audit(s.id, "pdf_download", oid);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="geumseo-report.pdf"',
          },
        });
      }
      if (/^reports\/[^/]+\/counsel$/.test(p))
        return json(readCounsel(s, z.string().uuid().parse(p.split("/")[1])));
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
    if (
      req.headers.get("origin") !== config().origin &&
      !(
        req.headers.get("origin") === "https://gumseo.kr" &&
        (p === "session" || p === "logout" || p.startsWith("admin/"))
      )
    )
      throw new Fault("요청 출처를 확인할 수 없습니다.", 403);
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new Fault("JSON 요청이 필요합니다.", 415);
    const b = await readJsonObject(req);
    if (p === "session") {
      const old = req.cookies.get("gs_session")?.value;
      if (old && svc.sessionFor(old)) return json({ ok: true });
      limit("session-global", 5000);
      const { token } = svc.newSession();
      return setCookie(json({ ok: true }), token, req);
    }
    const s = session(req);
    if (/^reports\/[^/]+\/counsel$/.test(p)) {
      limit("counsel:" + s.id, 10, 60000);
      return json(
        queueCounsel(
          s,
          z.string().uuid().parse(p.split("/")[1]),
          b.question,
          b.requestId,
        ),
      );
    }
    if (p === "logout") {
      run("DELETE FROM sessions WHERE id=?", s.id);
      const r = json({ ok: true });
      r.cookies.delete("gs_session");
      return r;
    }
    if (p === "readings") {
      limit("local-preview-host", 100, 86400000);
      const id = svc.makeReading(s, b);
      try {
        linkVisitReading(db(), req.cookies.get(visitorCookie)?.value, id);
      } catch {
        /* Optional analytics must never fail a customer's completed calculation. */
      }
      return json({ id }, 201);
    }
    if (p === "auth/request")
      return json({
        challengeId: svc.requestOtp(s, b.email),
        demoMail:
          !process.env.MAIL_WORKER_MODE ||
          process.env.MAIL_WORKER_MODE === "disabled",
        message: "주소가 올바르다면 인증 안내가 준비됩니다.",
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
      return setCookie(json({ ok: true }), token!, req);
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
    if (p === "payments/prepare-live")
      return json(liveCheckoutInfo(s, z.string().uuid().parse(b.orderId)));
    if (p === "payments/live-return")
      return json(
        await confirmLiveToss(
          s,
          z.string().uuid().parse(b.orderId),
          z.string().max(200).parse(b.paymentKey),
          z.number().int().parse(b.amount),
        ),
      );
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
          "재열람 안내를 요청했습니다. 구매 이메일의 받은편지함과 스팸함을 확인해주세요.",
      });
    }
    if (p === "email-change/request")
      return json({
        demoMail:
          !process.env.MAIL_WORKER_MODE ||
          process.env.MAIL_WORKER_MODE === "disabled",
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
      const token = loginAdmin(s, b.password);
      excludeAdminVisit(req);
      return setCookie(json({ ok: true }), token, req);
    }

    if (p === "admin/password") {
      requireRecentAdmin(s, ["operations"]);
      limit("admin-password:" + s.id, 5, 900000);
      if (!checkAdminPassword(z.string().max(200).parse(b.currentPassword)))
        throw new Fault("현재 비밀번호가 일치하지 않습니다.", 403);
      const password = z.string().min(12).max(200).parse(b.password);
      setAdminPassword(password);
      audit(s.id, "admin_password_changed", "local-operator");
      const response = json({ ok: true });
      response.cookies.delete("gs_session");
      return response;
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
        if (isLiveTossOrder(oid)) {
          if (b.confirmLiveRefund !== true)
            throw new Fault(
              "운영 전액 취소 대상을 명시적으로 확인해 주세요.",
              409,
            );
          if (b.testFailure === true)
            throw new Fault(
              "운영 주문에는 모의 취소를 사용할 수 없습니다.",
              409,
            );
          return json(
            await manageLiveRefund(
              s,
              oid,
              "refund",
              z.string().trim().min(5).max(200).parse(b.reason),
            ),
          );
        }
        svc.refund(
          s,
          oid,
          z.string().min(5).max(1000).parse(b.reason),
          b.testFailure === true,
        );
        return json({ ok: true });
      }
      if (p === "admin/refund-check" || p === "admin/refund-retry") {
        if (p === "admin/refund-retry" && b.confirmLiveRefund !== true)
          throw new Fault(
            "운영 전액 취소 재시도 대상을 명시적으로 확인해 주세요.",
            409,
          );
        return json(
          await manageLiveRefund(
            s,
            oid,
            p === "admin/refund-check" ? "check" : "retry",
          ),
        );
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
