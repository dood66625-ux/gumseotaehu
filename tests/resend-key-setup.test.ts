import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  prepareResendKeyForm,
  importResendKeyFile,
} from "../scripts/resend-key-setup.mjs";
it("rejects tampering, missing consent, wrong keys and extra env fields, then imports once while preserving all other settings", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "gumseo-resend-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env*\nvar/\n");
    const original =
      "APP_MODE=local\nEXTERNAL_EFFECTS=disabled\nOPENAI_API_KEY=preserve-existing-fixture\nTOSS_TEST_SECRET_KEY=preserve-toss-fixture\n";
    fs.writeFileSync(path.join(dir, ".env.local"), original, { mode: 0o600 });
    const form = prepareResendKeyForm(dir, path.join(dir, "form.html"));
    const privateDir = path.join(dir, "var/resend-key-import"),
      pem = path.join(privateDir, form.setupId + ".pem");
    const meta = JSON.parse(
      fs.readFileSync(path.join(privateDir, form.setupId + ".json"), "utf8"),
    );
    function encode(data: unknown, tamper = false) {
      const key = crypto.randomBytes(32),
        iv = crypto.randomBytes(12),
        aes = crypto.createCipheriv("aes-256-gcm", key, iv);
      aes.setAAD(Buffer.from(meta.aad));
      const cipher = Buffer.concat([
        aes.update(JSON.stringify(data)),
        aes.final(),
        aes.getAuthTag(),
      ]);
      if (tamper) cipher[0] ^= 1;
      const e = {
        version: 1,
        setupId: form.setupId,
        algorithm: "RSA-OAEP-256+A256GCM",
        wrappedKey: crypto
          .publicEncrypt(
            {
              key: crypto.createPublicKey(fs.readFileSync(pem)),
              oaepHash: "sha256",
            },
            key,
          )
          .toString("base64"),
        iv: iv.toString("base64"),
        ciphertext: cipher.toString("base64"),
      };
      const file = path.join(dir, "envelope.json");
      fs.writeFileSync(file, JSON.stringify(e));
      key.fill(0);
      return file;
    }
    const good = {
      apiKey: "re_synthetic_fixture_only",
      allowWriteEnvLocal: true,
    };
    for (const value of [
      { ...good, allowWriteEnvLocal: false },
      { ...good, apiKey: "sk-invalid" },
      { ...good, APP_MODE: "production" },
    ]) {
      expect(() => importResendKeyFile(dir, encode(value))).toThrow();
      expect(fs.readFileSync(path.join(dir, ".env.local"), "utf8")).toBe(
        original,
      );
    }
    expect(() => importResendKeyFile(dir, encode(good, true))).toThrow();
    const encrypted = encode(good);
    expect(importResendKeyFile(dir, encrypted)).toMatchObject({
      saved: true,
      externalEffectsEnabled: false,
      credentialValidityVerified: false,
    });
    const after = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(after).toContain(original);
    expect(after).toContain("RESEND_API_KEY=" + good.apiKey);
    expect(fs.statSync(path.join(dir, ".env.local")).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(pem)).toBe(false);
    expect(() => importResendKeyFile(dir, encrypted)).toThrow();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
it("refuses tracked env files before preparing a handoff", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "gumseo-resend-tracked-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    fs.writeFileSync(path.join(dir, ".env.local"), "APP_MODE=local\n");
    execFileSync("git", ["add", ".env.local"], { cwd: dir });
    expect(() =>
      prepareResendKeyForm(dir, path.join(dir, "form.html")),
    ).toThrow("IGNORED_AND_UNTRACKED");
    expect(fs.existsSync(path.join(dir, "form.html"))).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
