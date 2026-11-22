import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { runApprovedKnownReview } from "../lib/approved-synthetic-review";
import {
  syntheticChart,
  syntheticModel,
} from "../lib/integrations/ai-synthetic-fixtures";
import { generate } from "../lib/interpretation";
const key = Buffer.alloc(32, 7),
  apiKey = "sk-synthetic-approved-review-fixture";
function response() {
  const chart = syntheticChart("known"),
    report = generate(chart);
  for (const chapter of report.chapters)
    while (chapter.text.length < 350)
      chapter.text +=
        " 오늘 마음에 남은 일을 차분히 기록하고 작은 선택을 돌아보거라.";
  return {
    model: syntheticModel,
    status: "completed",
    output_text: JSON.stringify({
      intro: report.intro,
      chapters: report.chapters,
      notes: report.notes,
    }),
    usage: { input_tokens: 2000, output_tokens: 6000 },
  };
}
it("reserves the approved cap once, encrypts evidence and reopens without sending again", async () => {
  const db = new DatabaseSync(":memory:"),
    send = vi.fn(async () => Response.json(response()));
  try {
    const first = await runApprovedKnownReview(
      db,
      key,
      apiKey,
      send as typeof fetch,
    );
    expect(first).toMatchObject({
      newCalls: 1,
      budget: { calls: 1 },
      maximumEstimatedUsdMicros: 58500,
    });
    expect(first.report.promptVersion).toBe("taehou-ai-3");
    expect(send).toHaveBeenCalledTimes(1);
    const stored = String(
      db.prepare("SELECT report_enc FROM approved_review").get()!.report_enc,
    );
    expect(stored).not.toContain("그대");
    const again = await runApprovedKnownReview(
      db,
      key,
      apiKey,
      send as typeof fetch,
    );
    expect(again.newCalls).toBe(0);
    expect(again.report).toEqual(first.report);
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});
it.each(["network", "invalid-shape", "overspend"])(
  "does not retry or reset an uncertain %s response",
  async (mode) => {
    const db = new DatabaseSync(":memory:"),
      send = vi.fn(async () => {
        if (mode === "network") throw Error("private-error-not-for-output");
        const body = response();
        if (mode === "invalid-shape") body.output_text = "{}";
        if (mode === "overspend") body.usage.output_tokens = 50000;
        return Response.json(body);
      });
    try {
      await expect(
        runApprovedKnownReview(db, key, apiKey, send as typeof fetch),
      ).rejects.toThrow();
      expect(db.prepare("SELECT state FROM ai_spend_calls").get()?.state).toBe(
        "uncertain",
      );
      await expect(
        runApprovedKnownReview(db, key, apiKey, send as typeof fetch),
      ).rejects.toThrow("AI_ORDER_ALREADY_RESERVED");
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        db.prepare("SELECT count(*) n FROM approved_review").get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  },
);
it("persists client trace before network failure and keeps server headers when later validation fails", async () => {
  for (const mode of ["network", "invalid"]) {
    const db = new DatabaseSync(":memory:");
    const send = vi.fn(async (_url: any, init: any) => {
      const call = db.prepare("SELECT id FROM ai_spend_calls").get()!;
      expect(init.headers["X-Client-Request-Id"]).toBe(call.id);
      expect(
        db
          .prepare("SELECT client_request_id FROM approved_review_http_trace")
          .get()?.client_request_id,
      ).toBe(call.id);
      if (mode === "network") throw Error("synthetic network failure");
      return Response.json(
        { ...response(), output_text: "{}" },
        { headers: { "x-request-id": "req_trace_preserved" } },
      );
    });
    try {
      await expect(
        runApprovedKnownReview(db, key, apiKey, send as typeof fetch),
      ).rejects.toThrow();
      const row = db
        .prepare(
          "SELECT server_request_id,http_status FROM approved_review_http_trace",
        )
        .get()!;
      expect(row.server_request_id).toBe(
        mode === "network" ? null : "req_trace_preserved",
      );
      expect(row.http_status).toBe(mode === "network" ? null : 200);
      expect(db.prepare("SELECT state FROM ai_spend_calls").get()?.state).toBe(
        "uncertain",
      );
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  }
});
