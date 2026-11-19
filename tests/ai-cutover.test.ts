import { expect, it } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAiCutoverFile, readAiCutoverFile } from "../lib/ai-cutover";
const binding = {
    sourceId: "11111111-1111-4111-8111-111111111111",
    policyDigest: "a".repeat(64),
  },
  key = Buffer.alloc(32, 7),
  now = 1800000000000;
function fixture(run: (path: string, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "ai-cutover-"));
  chmodSync(dir, 0o700);
  try {
    run(join(dir, "policy.json"), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
it("retains the same cutoff across restarts and refuses to replace it", () =>
  fixture((path) => {
    expect(createAiCutoverFile(path, binding, key, now)).toEqual({
      createdAtOrAfter: now + 1,
      generationEnabledByCreation: false,
    });
    expect(readAiCutoverFile(path, binding, key, now + 86400000)).toEqual({
      createdAtOrAfter: now + 1,
    });
    expect(() => createAiCutoverFile(path, binding, key, now + 1000)).toThrow();
    expect(
      readAiCutoverFile(path, binding, key, now + 86400000).createdAtOrAfter,
    ).toBe(now + 1);
  }));
it("rejects tampered cutoff, wrong key, changed provider/profile or DB identity", () =>
  fixture((path) => {
    createAiCutoverFile(path, binding, key, now);
    expect(() =>
      readAiCutoverFile(path, binding, Buffer.alloc(32, 8), now + 1),
    ).toThrow("AI_CUTOVER_MISMATCH");
    expect(() =>
      readAiCutoverFile(
        path,
        { ...binding, policyDigest: "b".repeat(64) },
        key,
        now + 1,
      ),
    ).toThrow();
    expect(() =>
      readAiCutoverFile(
        path,
        { ...binding, sourceId: "22222222-2222-4222-8222-222222222222" },
        key,
        now + 1,
      ),
    ).toThrow();
    const record = JSON.parse(readFileSync(path, "utf8"));
    record.createdAtOrAfter = 0;
    writeFileSync(path, JSON.stringify(record));
    expect(() => readAiCutoverFile(path, binding, key, now + 1)).toThrow(
      "AI_CUTOVER_MISMATCH",
    );
  }));
it("rejects permissive files, symlinks, and future cutoff", () =>
  fixture((path, dir) => {
    createAiCutoverFile(path, binding, key, now);
    expect(() => readAiCutoverFile(path, binding, key, now - 1)).toThrow();
    chmodSync(path, 0o644);
    expect(() => readAiCutoverFile(path, binding, key, now + 1)).toThrow();
    chmodSync(path, 0o600);
    const link = join(dir, "link.json");
    symlinkSync(path, link);
    expect(() => readAiCutoverFile(link, binding, key, now + 1)).toThrow();
  }));
it("stores no credentials, recipient addresses or bodies and rejects unknown fields", () =>
  fixture((path) => {
    createAiCutoverFile(path, binding, key, now);
    const record = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(record).sort()).toEqual([
      "createdAtOrAfter",
      "policyDigest",
      "signature",
      "sourceId",
      "version",
    ]);
    record.credential = "not-allowed";
    writeFileSync(path, JSON.stringify(record));
    expect(() => readAiCutoverFile(path, binding, key, now + 1)).toThrow();
  }));
