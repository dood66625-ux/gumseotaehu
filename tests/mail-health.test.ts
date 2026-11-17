import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { mailQueueHealth } from "../lib/mail-health";
const now = 1800000000000;
function fixture() {
  const d = new DatabaseSync(":memory:");
  d.exec(readFileSync("db/001-init.sql", "utf8"));
  return d;
}
function add(d: DatabaseSync, id: string, state: string, updated = now) {
  d.prepare(
    "INSERT INTO outbox(id,email_hash,payload,status,created) VALUES(?,?,?,'local',?)",
  ).run(id, "sensitive-hash", "encrypted-private-payload", now);
  d.prepare(
    "INSERT INTO mail_queue(outbox_id,recipient_enc,message_enc,template,state,updated) VALUES(?,?,?,'otp',?,?)",
  ).run(id, "private-recipient", "private-code", state, updated);
}
describe("aggregate-only mail queue health", () => {
  it("does not confuse a quiet disabled queue or provider acceptance with delivery readiness", () => {
    const d = fixture();
    try {
      add(d, "local", "local_only");
      add(d, "sent", "accepted");
      d.prepare(
        "UPDATE mail_queue SET first_dispatched=? WHERE outbox_id='sent'",
      ).run(now - 1000);
      const before = d.prepare("SELECT * FROM mail_queue").all();
      const status = mailQueueHealth(d, now);
      expect(status).toMatchObject({
        total: 2,
        requiresAttention: false,
        launchReady: false,
        mailSentByCheck: false,
      });
      expect(status.counts.delivered).toBe(0);
      expect(d.prepare("SELECT * FROM mail_queue").all()).toEqual(before);
      expect(JSON.stringify(status)).not.toMatch(/private|sensitive|encrypted/);
    } finally {
      d.close();
    }
  });
  it("flags stuck dispatch, overdue queue, ambiguous results, restoration holds and old acceptance independently", () => {
    const d = fixture();
    try {
      add(d, "stuck", "sending");
      add(d, "late", "queued", now - 16 * 60000);
      add(d, "busy", "sending");
      d.prepare(
        "UPDATE mail_queue SET lease_until=? WHERE outbox_id='busy'",
      ).run(now + 1000);
      add(d, "unknown", "uncertain");
      add(d, "held", "queued", now - 16 * 60000);
      d.exec("UPDATE mail_queue SET recovery_hold=1 WHERE outbox_id='held'");
      add(d, "review", "review");
      add(d, "blocked", "blocked");
      add(d, "alien", "private-unrecognized-state");
      add(d, "old", "accepted");
      d.prepare(
        "UPDATE mail_queue SET first_dispatched=? WHERE outbox_id='old'",
      ).run(now - 86400000);
      const status = mailQueueHealth(d, now);
      expect(status.signals).toEqual({
        expiredLeases: 1,
        overdueQueue: 1,
        recoveryHeld: 1,
        acceptedWithoutDelivery: 1,
      });
      expect(status.issues).toHaveLength(8);
      expect(status.counts.other).toBe(1);
      expect(JSON.stringify(status)).not.toContain(
        "private-unrecognized-state",
      );
    } finally {
      d.close();
    }
  });
  it("does not treat terminal bounces and cancellations as undelivered queue backlog", () => {
    const d = fixture();
    try {
      for (const state of ["delivered", "bounced", "complained", "canceled"])
        add(d, state, state, now - 86400000);
      expect(mailQueueHealth(d, now).requiresAttention).toBe(false);
      expect(() => mailQueueHealth(d, NaN)).toThrow("INVALID_MAIL_HEALTH_TIME");
    } finally {
      d.close();
    }
  });
  it("CLI reads an existing DB without migration or mutation and rejects missing files without creating them", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-health-")),
      path = join(dir, "fixture.sqlite");
    try {
      const d = new DatabaseSync(path);
      d.exec(readFileSync("db/001-init.sql", "utf8"));
      add(d, "needs-review", "review");
      d.close();
      const before = readFileSync(path);
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/mail-status.ts", path],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout).issues).toContain(
        "MAIL_REVIEW_REQUIRED",
      );
      expect(readFileSync(path)).toEqual(before);
      const missing = join(dir, "missing.sqlite");
      const failed = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/mail-status.ts", missing],
        { encoding: "utf8" },
      );
      expect(failed.status).toBe(1);
      expect(failed.stderr).not.toContain(missing);
      expect(() => readFileSync(missing)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
