import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  prepareTossKeyForm,
  importTossKeyFile,
} from "../scripts/toss-key-setup.mjs";
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toss-key-setup-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  fs.writeFileSync(path.join(root, ".gitignore"), ".env*\nvar/\n");
  fs.writeFileSync(
    path.join(root, ".env.local"),
    "APP_MODE=local\nEXTERNAL_EFFECTS=disabled\nDATA_KEY=synthetic-existing-data-key\nOPENAI_API_KEY=synthetic-existing-value\n",
    { mode: 0o600 },
  );
  return root;
}
function envelope(root: string, setupId: string, data: unknown) {
  const dir = path.join(root, "var/toss-key-import");
  const privateKey = fs.readFileSync(path.join(dir, setupId + ".pem"));
  const key = crypto.randomBytes(32),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("gumseo-toss-widget-test:" + setupId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const file = path.join(root, "encrypted.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      setupId,
      algorithm: "RSA-OAEP-256+A256GCM",
      wrappedKey: crypto
        .publicEncrypt(
          {
            key: crypto.createPublicKey(privateKey),
            oaepHash: "sha256",
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          },
          key,
        )
        .toString("base64"),
      iv: iv.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
  );
  return file;
}
const data = {
  clientKey: "test_gck_synthetic_fixture",
  secretKey: "test_gsk_synthetic_fixture",
  allowWriteEnvLocal: true,
};
it("imports authenticated test credentials once while preserving encryption/auth settings and external-effect blocks", () => {
  const root = workspace();
  try {
    const output = path.join(root, "setup.html"),
      meta = prepareTossKeyForm(root, output);
    const html = fs.readFileSync(output, "utf8");
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain(data.secretKey);
    const file = envelope(root, meta.setupId, data);
    const result = importTossKeyFile(root, file);
    expect(result).toMatchObject({
      saved: true,
      kind: "widget",
      externalEffectsEnabled: false,
      credentialValidityVerified: false,
    });
    const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
    expect(env).toContain("DATA_KEY=synthetic-existing-data-key");
    expect(env).toContain("OPENAI_API_KEY=synthetic-existing-value");
    expect(env).toContain("EXTERNAL_EFFECTS=disabled");
    expect(env).toContain("TOSS_TEST_CLIENT_KEY=" + data.clientKey);
    expect(env).toContain("TOSS_TEST_SECRET_KEY=" + data.secretKey);
    expect(fs.statSync(path.join(root, ".env.local")).mode & 0o777).toBe(0o600);
    expect(
      fs.existsSync(
        path.join(root, "var/toss-key-import", meta.setupId + ".pem"),
      ),
    ).toBe(false);
    expect(() => importTossKeyFile(root, file)).toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it.each(["tamper", "no-consent", "live-key", "mixed-key", "extra-env"])(
  "leaves the env unchanged for %s",
  (kind) => {
    const root = workspace();
    try {
      const meta = prepareTossKeyForm(root, path.join(root, "setup.html"));
      const before = fs.readFileSync(path.join(root, ".env.local"), "utf8");
      let content: any = { ...data };
      if (kind === "no-consent") content.allowWriteEnvLocal = false;
      if (kind === "live-key") content.secretKey = "live_gsk_synthetic_fixture";
      if (kind === "mixed-key") content.secretKey = "test_sk_synthetic_fixture";
      if (kind === "extra-env") content.EXTERNAL_EFFECTS = "enabled";
      const file = envelope(root, meta.setupId, content);
      if (kind === "tamper") {
        const e = JSON.parse(fs.readFileSync(file, "utf8"));
        const b = Buffer.from(e.ciphertext, "base64");
        b[0] ^= 1;
        e.ciphertext = b.toString("base64");
        fs.writeFileSync(file, JSON.stringify(e));
      }
      expect(() => importTossKeyFile(root, file)).toThrow();
      expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(
        before,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
it("refuses tracked or symlink env targets", () => {
  const root = workspace();
  try {
    execFileSync("git", ["add", "-f", ".env.local"], { cwd: root });
    expect(() =>
      prepareTossKeyForm(root, path.join(root, "setup.html")),
    ).toThrow();
    execFileSync("git", ["rm", "--cached", ".env.local"], {
      cwd: root,
      stdio: "ignore",
    });
    fs.renameSync(path.join(root, ".env.local"), path.join(root, "outside"));
    fs.symlinkSync(path.join(root, "outside"), path.join(root, ".env.local"));
    expect(() =>
      prepareTossKeyForm(root, path.join(root, "setup.html")),
    ).toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it("CLI errors never echo plaintext from malformed credential payloads", () => {
  const root = workspace();
  try {
    const meta = prepareTossKeyForm(root, path.join(root, "setup.html")),
      file = envelope(root, meta.setupId, {
        ...data,
        secretKey: "sensitive-synthetic-marker-not-a-key",
      });
    const r = spawnSync(
      process.execPath,
      [path.resolve("scripts/toss-key-setup.mjs"), "import", file],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toContain("sensitive-synthetic-marker");
    expect(r.stderr).toContain("values suppressed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
