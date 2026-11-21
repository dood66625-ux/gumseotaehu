import { expect, it, vi } from "vitest";
vi.mock("../lib/security", () => ({
  Fault: class Fault extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  limit: vi.fn(),
}));
import {
  canonicalClientIp,
  proxyClientIp,
  protectProxyRequest,
} from "../lib/proxy-access";
import { limit } from "../lib/security";
const env = {
  CLIENT_IP_PROTECTION: "trusted-proxy",
  TRUSTED_PROXY_TOKEN: "a".repeat(64),
};
const headers = () =>
  new Headers({
    "x-gumseo-proxy-token": env.TRUSTED_PROXY_TOKEN,
    "x-gumseo-client-ip": "192.0.2.1",
  });
it("ignores forwarded claims when protection is disabled", () => {
  expect(
    proxyClientIp(new Headers({ "x-forwarded-for": "1.2.3.4" }), {}),
  ).toBeNull();
});
it("requires proxy authentication and one valid address, never a forwarded chain", () => {
  expect(proxyClientIp(headers(), env)).toBe("192.0.2.1");
  for (const changes of [
    { "x-gumseo-proxy-token": "b".repeat(64) },
    { "x-gumseo-client-ip": "192.0.2.1, 192.0.2.2" },
    { "x-gumseo-client-ip": "not-an-ip" },
  ]) {
    const h = headers();
    for (const [k, v] of Object.entries(changes)) h.set(k, v);
    expect(() => proxyClientIp(h, env)).toThrow();
  }
  expect(() =>
    proxyClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), env),
  ).toThrow();
  expect(() =>
    proxyClientIp(headers(), { ...env, TRUSTED_PROXY_TOKEN: "short" }),
  ).toThrow();
  expect(() =>
    proxyClientIp(headers(), { ...env, CLIENT_IP_PROTECTION: "typo" }),
  ).toThrow();
});
it("canonicalizes IPv6 aliases and IPv4-mapped addresses to prevent bucket bypass", () => {
  expect(canonicalClientIp("2001:0db8:0:0:0:0:0:1")).toBe("2001:db8::1");
  expect(canonicalClientIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
  expect(canonicalClientIp("::ffff:c000:201")).toBe("192.0.2.1");
  for (const value of [
    null,
    "127.0.0.1:123",
    "[::1]",
    "fe80::1%eth0",
    " 192.0.2.1",
    "999.1.2.3",
  ])
    expect(canonicalClientIp(value)).toBeNull();
});
it("applies authentication and financial buckets only after verified metadata", () => {
  vi.stubEnv("CLIENT_IP_PROTECTION", "trusted-proxy");
  vi.stubEnv("TRUSTED_PROXY_TOKEN", env.TRUSTED_PROXY_TOKEN);
  try {
    vi.mocked(limit).mockClear();
    protectProxyRequest(headers(), "admin/login", "POST");
    expect(limit).toHaveBeenCalledWith("proxy:auth:192.0.2.1", 15, 60000);
    vi.mocked(limit).mockClear();
    expect(() =>
      protectProxyRequest(new Headers(), "admin/refund", "POST"),
    ).toThrow();
    expect(limit).not.toHaveBeenCalled();
    protectProxyRequest(headers(), "admin/refund", "POST");
    expect(limit).toHaveBeenCalledWith("proxy:financial:192.0.2.1", 30, 60000);
  } finally {
    vi.unstubAllEnvs();
  }
});
