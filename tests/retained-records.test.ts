import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  initRetainedRecords,
  retainRecord,
  purgeRetainedRecords,
  setRetainedRecordHold,
} from "../lib/retained-records";
const at = Date.UTC(2020, 0, 1),
  base = {
    kind: "transaction" as const,
    payloadEncrypted: "encrypted-fixture",
    eventAt: at,
    closedAt: null,
    legalHold: false,
    activeWork: false,
    settled: true,
  };
it("is disabled by default and refuses execution without restore protection", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initRetainedRecords(db);
    retainRecord(db, { ...base, id: "a" });
    expect(purgeRetainedRecords(db)).toEqual({ enabled: false, purged: 0 });
    expect(() => purgeRetainedRecords(db, { enabled: true })).toThrow(
      "RESTORE_DELETION_PROTECTION_REQUIRED",
    );
    expect(db.prepare("SELECT count(*) n FROM retained_records").get()?.n).toBe(
      1,
    );
  } finally {
    db.close();
  }
});
it("uses five/three years and preserves holds, unresolved disputes and active work", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initRetainedRecords(db);
    for (const [id, patch] of [
      ["paid", {}],
      ["held", { legalHold: true }],
      ["working", { activeWork: true }],
      ["uncertain", { settled: false }],
      ["open", { kind: "dispute", closedAt: null }],
      ["closed", { kind: "dispute", closedAt: at }],
    ] as const)
      retainRecord(db, { ...base, ...patch, id });
    expect(
      purgeRetainedRecords(db, {
        enabled: true,
        restoreProtectionVerified: true,
        now: Date.UTC(2023, 0, 1),
      }).purged,
    ).toBe(1);
    expect(
      purgeRetainedRecords(db, {
        enabled: true,
        restoreProtectionVerified: true,
        now: Date.UTC(2025, 0, 1),
      }).purged,
    ).toBe(1);
    expect(db.prepare("SELECT count(*) n FROM retained_records").get()?.n).toBe(
      4,
    );
    expect(() => retainRecord(db, { ...base, id: "paid" })).toThrow("REIMPORT");
    setRetainedRecordHold(db, "held", false);
    expect(
      purgeRetainedRecords(db, {
        enabled: true,
        restoreProtectionVerified: true,
        now: Date.UTC(2025, 0, 1),
      }).purged,
    ).toBe(1);
  } finally {
    db.close();
  }
});
it("does not release a hold or shorten a deadline on re-import and rolls back a failed purge", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initRetainedRecords(db);
    retainRecord(db, {
      ...base,
      id: "a",
      eventAt: Date.UTC(2022, 0, 1),
      legalHold: true,
    });
    retainRecord(db, { ...base, id: "a" });
    expect(
      db.prepare("SELECT legal_hold,retain_until FROM retained_records").get(),
    ).toMatchObject({ legal_hold: 1, retain_until: Date.UTC(2027, 0, 1) });
    setRetainedRecordHold(db, "a", false);
    db.exec(
      "CREATE TRIGGER refuse_delete BEFORE DELETE ON retained_records BEGIN SELECT RAISE(ABORT,'fixture'); END",
    );
    expect(() =>
      purgeRetainedRecords(db, {
        enabled: true,
        restoreProtectionVerified: true,
        now: Date.UTC(2030, 0, 1),
      }),
    ).toThrow();
    expect(
      db.prepare("SELECT count(*) n FROM retention_purge_receipts").get()?.n,
    ).toBe(0);
    expect(db.prepare("SELECT count(*) n FROM retained_records").get()?.n).toBe(
      1,
    );
  } finally {
    db.close();
  }
});

it("re-importing an open dispute never converts its missing closure time to an expired timestamp", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initRetainedRecords(db);
    const row = { ...base, id: "open", kind: "dispute" as const };
    retainRecord(db, row);
    retainRecord(db, row);
    expect(
      db.prepare("SELECT closed_at FROM retained_records").get()?.closed_at,
    ).toBeNull();
    expect(
      purgeRetainedRecords(db, {
        enabled: true,
        restoreProtectionVerified: true,
        now: Date.UTC(2030, 0, 1),
      }).purged,
    ).toBe(0);
  } finally {
    db.close();
  }
});
