import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { packageRuntime } from "../scripts/package-runtime.mjs";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "gumseo-runtime-"));
  const source = join(dir, "source"),
    out = join(dir, "out");
  for (const sub of [
    ".next/standalone",
    ".next/static",
    "dist",
    "assets",
    "public",
    "db",
    "scripts",
  ])
    mkdirSync(join(source, sub), { recursive: true });
  for (const file of [
    ".next/standalone/server.js",
    "dist/worker.js",
    "dist/runtime-health.js",
    "db/001-init.sql",
    "scripts/toss-sandbox-client.mjs",
  ])
    writeFileSync(join(source, file), "fixture");
  return { dir, source, out };
}
it("packages only runtime files with hashes and preserves safe relative links; refuses overwriting", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, ".env.local"), "private");
    mkdirSync(join(f.source, "var"));
    writeFileSync(join(f.source, "var", "private.sqlite"), "private");
    symlinkSync("server.js", join(f.source, ".next/standalone", "link.js"));
    const result = packageRuntime(f.source, f.out);
    expect(result.files).toBe(6);
    expect(existsSync(join(f.out, ".env.local"))).toBe(false);
    expect(existsSync(join(f.out, "var"))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(join(f.out, "runtime-manifest.json"), "utf8"),
    );
    expect(
      manifest.files.find((x: any) => x.path === "server.js").sha256,
    ).toHaveLength(64);
    expect(() => packageRuntime(f.source, f.out)).toThrow("NEW_ARTIFACT");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
it.each(["secret", "private-path", "external-link"])(
  "rejects %s without leaving a partial artifact",
  (kind) => {
    const f = fixture();
    const secret = "fake-private-marker-".repeat(3);
    try {
      if (kind === "secret")
        writeFileSync(join(f.source, ".next/standalone/server.js"), secret);
      if (kind === "private-path")
        writeFileSync(join(f.source, ".next/standalone/.env.local"), "private");
      if (kind === "external-link")
        symlinkSync(
          join(f.source, "db/001-init.sql"),
          join(f.source, ".next/standalone", "bad-link"),
        );
      expect(() => packageRuntime(f.source, f.out, [secret])).toThrow();
      expect(existsSync(f.out)).toBe(false);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);

it("includes reviewed deploy templates without copying their private configuration", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.source, "deploy"));
    writeFileSync(
      join(f.source, "deploy", "Caddyfile.private"),
      "basic_auth {}",
    );
    packageRuntime(f.source, f.out);
    expect(
      readFileSync(join(f.out, "deploy", "Caddyfile.private"), "utf8"),
    ).toBe("basic_auth {}");
    expect(existsSync(join(f.out, "deploy", "private-gateway.conf"))).toBe(
      false,
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
