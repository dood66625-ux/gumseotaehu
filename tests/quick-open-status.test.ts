import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { inspectQuickOpen } from "../scripts/quick-open-status.mjs";
it("reports missing runtime settings without requiring completed card review or exposing values", () => {
  const r = inspectQuickOpen({
    TOSS_LIVE_SECRET_KEY: "live_sk_private-fixture",
    OPENAI_API_KEY: "private-ai-key",
    RESEND_API_KEY: "private-mail-key",
  });
  expect(r.cardReviewCompletionRequiredForThisCheck).toBe(false);
  expect(r.launchReady).toBe(false);
  expect(r.providerCalls).toBe(0);
  expect(r.settingsChanged).toBe(false);
  expect(JSON.stringify(r)).not.toContain("private-");
  expect(r.checks.some((c: any) => c.id === "payment-mode" && !c.ok)).toBe(
    true,
  );
});
it("reads enrollment holds without creating schemas, files or altering the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-quick-"));
  const path = join(dir, "state.sqlite");
  try {
    const d = new DatabaseSync(path);
    d.exec(
      "CREATE TABLE toss_live_enrollment(id INTEGER PRIMARY KEY,recovery_hold INTEGER); INSERT INTO toss_live_enrollment VALUES(1,1)",
    );
    d.close();
    const before = readFileSync(path);
    const r = inspectQuickOpen({ DATABASE_PATH: path });
    expect(r.checks.find((c: any) => c.id === "database")!.ok).toBe(true);
    expect(r.checks.find((c: any) => c.id === "payment-enrollment")!.ok).toBe(
      false,
    );
    expect(readFileSync(path)).toEqual(before);
    const missing = join(dir, "must-not-create.sqlite");
    inspectQuickOpen({ DATABASE_PATH: missing });
    expect(() => readFileSync(missing)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
