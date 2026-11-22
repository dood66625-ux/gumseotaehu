import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAiRequest } from "../lib/integrations/ai-contract";
import {
  createSyntheticOpenAiTransport,
  usageTelemetry,
} from "../lib/integrations/openai-http";
import {
  syntheticChart,
  syntheticModel,
} from "../lib/integrations/ai-synthetic-fixtures";
import { openSyntheticBudget } from "../lib/ai-synthetic-budget";
const fakeKey = "sk-synthetic_test_credentials_012345678901234567890";
function request() {
  return {
    method: "POST" as const,
    path: "/v1/responses",
    headers: { "Content-Type": "application/json" },
    body: buildAiRequest(syntheticChart("known"), syntheticModel),
    timeoutMs: 45000,
  };
}
function response(extra: Record<string, unknown> = {}) {
  return Response.json(
    {
      model: syntheticModel,
      status: "completed",
      usage: {
        input_tokens: 100,
        output_tokens: 200,
        input_tokens_details: { cached_tokens: 10 },
      },
      ...extra,
    },
    { headers: { "x-request-id": "req_synthetic" } },
  );
}
function setup(fetchImpl = vi.fn(async () => response())) {
  const reserve = vi.fn(),
    usage = vi.fn();
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve,
    onUsage: usage,
    fetch: fetchImpl as typeof fetch,
  });
  return { transport, reserve, usage, fetchImpl };
}
afterEach(() => vi.restoreAllMocks());
it("defaults to blocked and does not reserve or call fetch", async () => {
  const reserve = vi.fn(),
    fetchImpl = vi.fn();
  const transport = createSyntheticOpenAiTransport({
    fixture: "known",
    apiKey: fakeKey,
    reserve,
    fetch: fetchImpl,
  });
  await expect(transport(request())).rejects.toThrow("NOT_APPROVED");
  expect(reserve).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("pins origin, fixture, model, body and headers; reports integer usage with no invented KRW conversion", async () => {
  const s = setup();
  await s.transport(request());
  expect(s.reserve).toHaveBeenCalledOnce();
  expect(s.fetchImpl).toHaveBeenCalledOnce();
  const [url, options] = s.fetchImpl.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://api.openai.com/v1/responses");
  expect(options.redirect).toBe("error");
  expect(options.cache).toBe("no-store");
  expect(options.headers).toEqual({
    "Content-Type": "application/json",
    Authorization: "Bearer " + fakeKey,
  });
  expect(s.usage).toHaveBeenCalledWith({
    inputTokens: 100,
    outputTokens: 200,
    cachedTokens: 10,
    requestId: "req_synthetic",
    estimatedUsdMicros: 975,
  });
});
it.each(["path", "method", "model", "data", "headers", "timeout"])(
  "rejects mutated %s before reservation/network",
  async (part) => {
    const s = setup();
    const r = request();
    if (part === "path") r.path = "https://evil.invalid";
    if (part === "method") r.method = "GET" as "POST";
    if (part === "model") r.body.model = "another-model";
    if (part === "data") r.body.input[0].content[0].text += " customer data";
    if (part === "headers") r.headers["Content-Type"] = "text/plain";
    if (part === "timeout") r.timeoutMs = 999999;
    await expect(s.transport(r)).rejects.toThrow();
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.fetchImpl).not.toHaveBeenCalled();
  },
);
it.each([
  [401, "AI_KEY_REJECTED"],
  [403, "AI_ACCESS_DENIED"],
  [429, "AI_QUOTA_OR_RATE_LIMIT"],
  [503, "AI_PROVIDER_UNAVAILABLE"],
  [400, "AI_REQUEST_REJECTED"],
])("sanitizes HTTP %s and never auto-retries", async (status, code) => {
  const s = setup(
    vi.fn(
      async () =>
        new Response("private provider error must not be echoed", {
          status: Number(status),
          headers: { "retry-after": "30" },
        }),
    ),
  );
  await expect(s.transport(request())).rejects.toMatchObject({
    message: code,
    httpStatus: status,
    retryAfterSeconds: 30,
  });
  expect(s.fetchImpl).toHaveBeenCalledOnce();
});
it("reserves uncertainty and aborts on deadline with no retry", async () => {
  const fetchImpl = vi.fn(
    (_url: unknown, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal!.addEventListener("abort", () =>
          reject(Error("private connection details")),
        ),
      ),
  );
  const s = setup(fetchImpl as any);
  const r = request();
  r.timeoutMs = 5;
  await expect(s.transport(r)).rejects.toThrow("AI_TIMEOUT_UNCERTAIN");
  expect(s.reserve).toHaveBeenCalledOnce();
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each([
  "content-type",
  "declared-size",
  "stream-size",
  "json",
  "model",
  "usage",
])("rejects invalid %s response", async (kind) => {
  let r: Response;
  if (kind === "content-type") r = new Response("hi");
  else if (kind === "declared-size")
    r = new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": "300000",
      },
    });
  else if (kind === "stream-size")
    r = new Response("x".repeat(262145), {
      headers: { "content-type": "application/json" },
    });
  else if (kind === "json")
    r = new Response("{broken", {
      headers: { "content-type": "application/json" },
    });
  else if (kind === "model") r = response({ model: "changed-model" });
  else r = response({ usage: { input_tokens: -10, output_tokens: 3 } });
  const s = setup(vi.fn(async () => r));
  await expect(s.transport(request())).rejects.toThrow();
  expect(s.usage).not.toHaveBeenCalled();
});
it("rejects impossible usage and suppresses unsafe request IDs", () => {
  for (const usage of [
    { input_tokens: NaN, output_tokens: 1 },
    { input_tokens: 1, output_tokens: Infinity },
    {
      input_tokens: 1,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 3 },
    },
  ])
    expect(() => usageTelemetry({ usage }, null)).toThrow("AI_INVALID_USAGE");
  expect(
    usageTelemetry(
      { usage: { input_tokens: 1, output_tokens: 2 } },
      "private value with spaces",
    ).requestId,
  ).toBeNull();
});
it("persisted call reservations survive failure, restart and competing handles, with a three-call lifetime cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-budget-"));
  let b = openSyntheticBudget(join(dir, "budget.sqlite"));
  let second: ReturnType<typeof openSyntheticBudget> | undefined;
  try {
    const first = b.reserve();
    b.finish(first, "uncertain", "AI_TIMEOUT_UNCERTAIN");
    b.close();
    b = openSyntheticBudget(join(dir, "budget.sqlite"));
    second = openSyntheticBudget(join(dir, "budget.sqlite"));
    b.reserve();
    second.reserve();
    expect(() => b.reserve()).toThrow("BUDGET_EXHAUSTED");
    expect(() => second!.reserve()).toThrow("BUDGET_EXHAUSTED");
    expect(b.summary()).toMatchObject({
      calls: 3,
      callLimit: 3,
      reservedUsdMicros: 180000,
      uncertain: 3,
    });
  } finally {
    b.close();
    second?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it.each([
  ["insufficient_quota", "AI_QUOTA_EXHAUSTED"],
  ["credit_balance_exhausted", "AI_QUOTA_EXHAUSTED"],
  ["billing_hard_limit_reached", "AI_QUOTA_EXHAUSTED"],
  ["rate_limit_exceeded", "AI_RATE_LIMITED"],
])(
  "distinguishes 429 provider code %s without exposing the error message",
  async (providerCode, code) => {
    const s = setup(
      vi.fn(async () =>
        Response.json(
          { error: { code: providerCode, message: "private provider text" } },
          { status: 429 },
        ),
      ),
    );
    await expect(s.transport(request())).rejects.toMatchObject({
      code,
      httpStatus: 429,
    });
    expect(s.fetchImpl).toHaveBeenCalledOnce();
  },
);
it("stops when usage persistence fails, rather than losing the cost record silently", async () => {
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve() {},
    onUsage() {
      throw Error("private database info");
    },
    fetch: vi.fn(async () => response()),
  });
  await expect(transport(request())).rejects.toThrow("AI_USAGE_PERSIST_FAILED");
});

it("allows one durable funded-resume slot without resetting original calls or granting twice", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-resume-")),
    path = join(dir, "budget.sqlite");
  let ledger = openSyntheticBudget(path);
  try {
    for (let i = 0; i < 3; i++) ledger.reserve();
    expect(() => ledger.reserve()).toThrow("BUDGET_EXHAUSTED");
    ledger.close();
    ledger = openSyntheticBudget(path, { fundedResume: true });
    ledger.reserve();
    expect(ledger.summary()).toMatchObject({
      calls: 4,
      baseCallLimit: 3,
      fundedResumeCalls: 1,
      callLimit: 4,
      reservedUsdMicros: 240000,
    });
    ledger.close();
    ledger = openSyntheticBudget(path, { fundedResume: true });
    expect(() => ledger.reserve()).toThrow("BUDGET_EXHAUSTED");
    expect(ledger.summary().fundedResumeCalls).toBe(1);
  } finally {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("captures synthetic response evidence after usage, and fails closed if evidence cannot persist", async () => {
  const events: string[] = [];
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve() {},
    onUsage() {
      events.push("usage");
    },
    onResponse() {
      events.push("response");
      throw Error("private filesystem detail");
    },
    fetch: vi.fn(async () => response()),
  });
  await expect(transport(request())).rejects.toThrow(
    "AI_EVIDENCE_PERSIST_FAILED",
  );
  expect(events).toEqual(["usage", "response"]);
});

it("per-order transport rejects unapproved or mismatched requests before reservation/network", async () => {
  const { createOrderOpenAiTransport } =
    await import("../lib/integrations/openai-http");
  const network = vi.fn(async () => response()),
    reserve = vi.fn();
  const options = {
    chart: syntheticChart("known"),
    apiKey: fakeKey,
    reserve,
    fetch: network as typeof fetch,
  };
  await expect(createOrderOpenAiTransport(options)(request())).rejects.toThrow(
    "EXTERNAL_TRANSMISSION_NOT_APPROVED",
  );
  const transport = createOrderOpenAiTransport({
    ...options,
    approval: "customer-data-approved",
  });
  await expect(
    transport({
      ...request(),
      body: buildAiRequest(syntheticChart("unknown"), syntheticModel),
    }),
  ).rejects.toThrow("AI_ORDER_REQUEST_MISMATCH");
  expect(reserve).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
it("per-order transport pins chart at construction and records usage before returning", async () => {
  const { createOrderOpenAiTransport } =
    await import("../lib/integrations/openai-http");
  const chart = syntheticChart("known"),
    events: string[] = [];
  const transport = createOrderOpenAiTransport({
    approval: "customer-data-approved",
    chart,
    apiKey: fakeKey,
    reserve() {
      events.push("reserved");
    },
    fetch: async () => {
      events.push("network");
      return response();
    },
    onUsage() {
      events.push("usage");
    },
  });
  chart.counts.木 = 99;
  await transport(request());
  events.push("returned");
  expect(events).toEqual(["reserved", "network", "usage", "returned"]);
});

it("records sanitized response headers before a body failure and sends an explicit client trace", async () => {
  const reserve = vi.fn(),
    headers = vi.fn(),
    send = vi.fn(
      async () =>
        new Response("invalid-json", {
          headers: {
            "x-request-id": "req_trace_test",
            "content-type": "application/json",
          },
        }),
    );
  const transport = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve,
    fetch: send as typeof fetch,
    clientRequestId: () => "client_trace_test",
    onResponseHeaders: headers,
  });
  await expect(transport(request())).rejects.toThrow("AI_INVALID_JSON");
  expect(headers).toHaveBeenCalledWith({
    requestId: "req_trace_test",
    httpStatus: 200,
  });
  const options = (send.mock.calls as unknown as [string, RequestInit][])[0][1];
  expect(options.headers).toMatchObject({
    "X-Client-Request-Id": "client_trace_test",
  });
  expect(send).toHaveBeenCalledTimes(1);
});
it("refuses invalid trace IDs before sending and never retries when trace persistence fails", async () => {
  const send = vi.fn(async () => response());
  const invalid = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve() {},
    fetch: send as typeof fetch,
    clientRequestId: () => "unsafe\nvalue",
  });
  await expect(invalid(request())).rejects.toThrow(
    "AI_INVALID_CLIENT_REQUEST_ID",
  );
  expect(send).not.toHaveBeenCalled();
  const failed = createSyntheticOpenAiTransport({
    approval: "synthetic-only",
    fixture: "known",
    apiKey: fakeKey,
    reserve() {},
    fetch: send as typeof fetch,
    onResponseHeaders() {
      throw Error("private storage failure");
    },
  });
  await expect(failed(request())).rejects.toThrow("AI_TRACE_PERSIST_FAILED");
  expect(send).toHaveBeenCalledTimes(1);
});
