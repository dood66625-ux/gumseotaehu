import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
const sanitize = resolve("scripts/sanitize-standalone.mjs"),
  scan = resolve("scripts/check-secrets.mjs");
it("removes copied env/data from the deployment bundle while preserving application files", () => {
  const dir = mkdtempSync(join(tmpdir(), "standalone-safety-"));
  try {
    const root = join(dir, ".next/standalone");
    mkdirSync(join(root, "nested"), { recursive: true });
    mkdirSync(join(root, "var"));
    writeFileSync(join(root, ".env.production"), "synthetic-private-value");
    writeFileSync(join(root, "nested/.env.local"), "synthetic-private-value");
    writeFileSync(join(root, "var/private.sqlite"), "synthetic-private-value");
    writeFileSync(join(root, "server.js"), "application code");
    const out = execFileSync(process.execPath, [sanitize], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(out).not.toContain("synthetic-private-value");
    expect(existsSync(join(root, ".env.production"))).toBe(false);
    expect(existsSync(join(root, "nested/.env.local"))).toBe(false);
    expect(existsSync(join(root, "var"))).toBe(false);
    expect(readFileSync(join(root, "server.js"), "utf8")).toBe(
      "application code",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("refuses a symlink deployment root rather than deleting the linked directory's files", () => {
  const dir = mkdtempSync(join(tmpdir(), "standalone-symlink-"));
  try {
    mkdirSync(join(dir, ".next"));
    mkdirSync(join(dir, "outside"));
    writeFileSync(join(dir, "outside/.env.local"), "synthetic-private-value");
    symlinkSync(join(dir, "outside"), join(dir, ".next/standalone"), "dir");
    const result = spawnSync(process.execPath, [sanitize], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(dir, "outside/.env.local"), "utf8")).toBe(
      "synthetic-private-value",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("detects an OpenAI key copied into a server artifact without echoing its value", () => {
  const dir = mkdtempSync(join(tmpdir(), "secret-asset-"));
  const fake = "sk-synthetic_fixture_for_secret_scanner_only_0123456789";
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, ".gitignore"), ".env*\n.next/\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: dir });
    writeFileSync(join(dir, ".env.local"), "OPENAI_API_KEY=" + fake + "\n");
    mkdirSync(join(dir, ".next/standalone"), { recursive: true });
    writeFileSync(
      join(dir, ".next/standalone/snapshot.json"),
      JSON.stringify({ copiedCredential: fake }),
    );
    const result = spawnSync(process.execPath, [scan, "--built"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, OPENAI_API_KEY: fake },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_API_KEY");
    expect(result.stdout + result.stderr).not.toContain(fake);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
