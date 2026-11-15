/** Persistent lifetime call limit for the separate synthetic test harness. No automatic resets/refunds. */
import { DatabaseSync } from "node:sqlite";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { AiCallTelemetry } from "./integrations/openai-http";
export const syntheticCallLimit = 3;
// 24KB maximum request + 9k output tokens => conservative $0.06 list-price reservation.
export const syntheticReservationUsdMicros = 60000;
export function openSyntheticBudget(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())
      throw Error("UNSAFE_AI_BUDGET_PATH");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,state TEXT NOT NULL,created INTEGER NOT NULL,
    code TEXT,input_tokens INTEGER,output_tokens INTEGER,cached_tokens INTEGER,request_id TEXT,estimated_usd_micros INTEGER);`);
  return {
    reserve() {
      db.exec("BEGIN IMMEDIATE");
      try {
        const n = db.prepare("SELECT count(*) n FROM calls").get()!.n as number;
        if (n >= syntheticCallLimit)
          throw Error("AI_SYNTHETIC_BUDGET_EXHAUSTED");
        const id = randomUUID();
        db.prepare(
          "INSERT INTO calls(id,state,created) VALUES(?,'reserved',?)",
        ).run(id, Date.now());
        db.exec("COMMIT");
        return id;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    usage(id: string, usage: AiCallTelemetry) {
      db.prepare(
        "UPDATE calls SET input_tokens=?,output_tokens=?,cached_tokens=?,request_id=?,estimated_usd_micros=? WHERE id=?",
      ).run(
        usage.inputTokens,
        usage.outputTokens,
        usage.cachedTokens,
        usage.requestId,
        usage.estimatedUsdMicros,
        id,
      );
    },
    finish(
      id: string,
      state: "completed" | "failed" | "uncertain",
      code: string | null = null,
    ) {
      if (code && !/^[A-Z0-9_]{1,80}$/.test(code))
        throw Error("INVALID_AI_ERROR_CODE");
      db.prepare("UPDATE calls SET state=?,code=? WHERE id=?").run(
        state,
        code,
        id,
      );
    },
    summary() {
      const row = db
        .prepare(
          "SELECT count(*) calls,COALESCE(sum(estimated_usd_micros),0) estimatedUsdMicros,sum(CASE WHEN input_tokens IS NOT NULL THEN 1 ELSE 0 END) usage_known_calls,sum(CASE WHEN state='reserved' OR state='uncertain' THEN 1 ELSE 0 END) uncertain FROM calls",
        )
        .get()!;
      return {
        calls: Number(row.calls),
        usageKnownCalls: Number(row.usage_known_calls ?? 0),
        usageUnknownCalls:
          Number(row.calls) - Number(row.usage_known_calls ?? 0),
        estimatedUsdMicros: Number(row.estimatedUsdMicros),
        uncertain: Number(row.uncertain ?? 0),
        callLimit: syntheticCallLimit,
        reservedUsdMicros: Number(row.calls) * syntheticReservationUsdMicros,
      };
    },
    close() {
      db.close();
    },
  };
}
