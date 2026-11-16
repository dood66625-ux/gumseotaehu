import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { openOwnerMailTest, ownerMailProfile } from "../lib/owner-mail-test";
function fixture() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "gumseo-owner-mail-")),
    key = randomBytes(32),
    ledger = openOwnerMailTest(dir, key),
    gateway = {
      name: "resend-gumseo-mail",
      idempotencyWindowMs: 86400000,
      send: vi.fn(async (_m: unknown, key: string) => ({
        key,
        providerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })),
      lookup: vi.fn(),
    };
  return {
    dir,
    key,
    ledger,
    gateway,
    clean() {
      ledger.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
it("prepares an immutable encrypted draft without sending and uses only the fixed owner recipient", () => {
  const f = fixture();
  try {
    const a = f.ledger.prepare(),
      b = f.ledger.prepare();
    expect(a).toEqual(b);
    expect(a.envelope.to).toBe(ownerMailProfile.replyTo);
    expect(a.envelope.from).toBe("archive@mail.gumseo.kr");
    expect(f.gateway.send).not.toHaveBeenCalled();
    expect(
      fs
        .readFileSync(path.join(f.dir, "attempt.sqlite"))
        .includes(Buffer.from(a.envelope.to)),
    ).toBe(false);
  } finally {
    f.clean();
  }
});
it("requires exact draft approval and keeps the default sender blocked", async () => {
  const f = fixture();
  try {
    const d = f.ledger.prepare();
    await expect(f.ledger.send("invalid", f.gateway)).rejects.toThrow(
      "APPROVAL_REQUIRED",
    );
    await expect(f.ledger.send(d.approvalHash)).rejects.toThrow("NOT_APPROVED");
    expect(f.gateway.send).not.toHaveBeenCalled();
    expect(f.ledger.status().state).toBe("prepared");
  } finally {
    f.clean();
  }
});
it("allows one approved send and preserves acceptance across restart without sending twice", async () => {
  const f = fixture();
  try {
    const d = f.ledger.prepare();
    expect((await f.ledger.send(d.approvalHash, f.gateway)).state).toBe(
      "accepted",
    );
    expect(
      (await f.ledger.send(d.approvalHash, f.gateway)).alreadyAccepted,
    ).toBe(true);
    f.ledger.close();
    const resumed = openOwnerMailTest(f.dir, f.key);
    try {
      expect(
        (await resumed.send(d.approvalHash, f.gateway)).alreadyAccepted,
      ).toBe(true);
    } finally {
      resumed.close();
    }
    expect(f.gateway.send).toHaveBeenCalledOnce();
  } finally {
    f.clean();
  }
});
it("records an unknown acknowledgement durably and never automatically retries", async () => {
  const f = fixture();
  try {
    const d = f.ledger.prepare();
    f.gateway.send.mockRejectedValueOnce(Error("private provider error"));
    await expect(f.ledger.send(d.approvalHash, f.gateway)).rejects.toThrow(
      "RECONCILIATION_REQUIRED",
    );
    await expect(f.ledger.send(d.approvalHash, f.gateway)).rejects.toThrow(
      "RECONCILIATION_REQUIRED",
    );
    expect(f.gateway.send).toHaveBeenCalledOnce();
    expect(f.ledger.status().state).toBe("uncertain");
  } finally {
    f.clean();
  }
});
