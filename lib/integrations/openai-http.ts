import { aiRequestPolicy, type AiGenerationProfile } from "./ai-request-policy";
/** Pinned HTTP adapters. Customer transport is registered only by explicitly enrolled workers. */
import type { Chart } from "../astrology";
import { buildAiRequest } from "./ai-contract";
import {
  syntheticChart,
  syntheticModel,
  type SyntheticFixture,
} from "./ai-synthetic-fixtures";
import type { Transport } from "./contracts";
export class AiHttpError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number | null = null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}
export type AiCallTelemetry = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestId: string | null;
  estimatedUsdMicros: number;
};
export const aiPricing = {
  version: "openai-gpt-5.4-mini-2026-11-15",
  inputUsdPerMillion: 0.75,
  outputUsdPerMillion: 4.5,
};
export function usageTelemetry(
  raw: unknown,
  requestId: string | null,
): AiCallTelemetry {
  const r = raw as Record<string, any>;
  const input = r?.usage?.input_tokens,
    output = r?.usage?.output_tokens;
  const cached = r?.usage?.input_tokens_details?.cached_tokens ?? 0;
  if (
    ![input, output, cached].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    cached > input
  )
    throw new AiHttpError("AI_INVALID_USAGE");
  return {
    inputTokens: input,
    outputTokens: output,
    cachedTokens: cached,
    requestId:
      requestId && /^[a-zA-Z0-9_-]{1,160}$/.test(requestId) ? requestId : null,
    // Conservative list-price estimate; cached discount omitted. Never call this an invoice.
    estimatedUsdMicros: Math.ceil(
      input * aiPricing.inputUsdPerMillion +
        output * aiPricing.outputUsdPerMillion,
    ),
  };
}
async function readBoundedJson(
  response: Response,
): Promise<Record<string, any>> {
  if (Number(response.headers.get("content-length")) > 262144) {
    await response.body?.cancel();
    throw new AiHttpError("AI_RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AiHttpError("AI_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new AiHttpError("AI_RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AiHttpError("AI_INVALID_JSON");
  }
}
type OpenAiHttpOptions = {
  apiKey: string;
  reserve: () => void;
  onUsage?: (usage: AiCallTelemetry) => void;
  onResponse?: (response: Record<string, any>) => void;
  fetch?: typeof fetch;
  clientRequestId?: () => string;
  onResponseHeaders?: (trace: {
    requestId: string | null;
    httpStatus: number;
  }) => void;
};
export const approvedOpenAiModel = syntheticModel;
export function createSyntheticOpenAiTransport(
  options: OpenAiHttpOptions & {
    approval?: "synthetic-only";
    fixture: SyntheticFixture;
    profile?: AiGenerationProfile;
    reviewBudgetUsdMicros?: 100000;
  },
): Transport {
  return pinnedTransport(
    options,
    () =>
      options.approval === "synthetic-only" &&
      (options.profile !== "synthetic-review-v1" ||
        options.reviewBudgetUsdMicros === 100000),
    () =>
      buildAiRequest(
        syntheticChart(options.fixture),
        syntheticModel,
        "ko",
        options.profile,
      ),
    "SYNTHETIC_REQUEST_MISMATCH",
    aiRequestPolicy(options.profile).timeoutMs,
  );
}
/** Explicit future opt-in only. Approval is supplied by trusted integration, never request input. */
export function createOrderOpenAiTransport(
  options: OpenAiHttpOptions & {
    approval?: "customer-data-approved";
    chart: Chart;
    locale?: "ko" | "zh-TW";
  },
): Transport {
  const chart = structuredClone(options.chart);
  return pinnedTransport(
    options,
    () => options.approval === "customer-data-approved",
    () => buildAiRequest(chart, approvedOpenAiModel, options.locale),
    "AI_ORDER_REQUEST_MISMATCH",
  );
}
function pinnedTransport(
  options: OpenAiHttpOptions,
  approved: () => boolean,
  expectedRequest: () => ReturnType<typeof buildAiRequest>,
  mismatch: string,
  maximumTimeoutMs = 45000,
): Transport {
  return async (request) => {
    if (!approved())
      throw new AiHttpError("EXTERNAL_TRANSMISSION_NOT_APPROVED");
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(options.apiKey))
      throw new AiHttpError("AI_CREDENTIAL_REQUIRED");
    const expected = expectedRequest();
    if (
      request.method !== "POST" ||
      request.path !== "/v1/responses" ||
      JSON.stringify(request.body) !== JSON.stringify(expected) ||
      JSON.stringify(request.headers) !==
        JSON.stringify({ "Content-Type": "application/json" })
    )
      throw new AiHttpError(mismatch);
    const body = JSON.stringify(expected);
    if (Buffer.byteLength(body) > 24000)
      throw new AiHttpError("AI_INPUT_TOO_LARGE");
    if (
      !Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 1 ||
      request.timeoutMs > maximumTimeoutMs
    )
      throw new AiHttpError("AI_INVALID_TIMEOUT");
    options.reserve(); // Durable reservation before any network effect, including uncertain outcomes.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const clientRequestId = options.clientRequestId?.();
      if (
        clientRequestId !== undefined &&
        (typeof clientRequestId !== "string" ||
          !/^[A-Za-z0-9_-]{1,160}$/.test(clientRequestId))
      )
        throw new AiHttpError("AI_INVALID_CLIENT_REQUEST_ID");
      const response = await (options.fetch ?? fetch)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + options.apiKey,
            ...(clientRequestId
              ? { "X-Client-Request-Id": clientRequestId }
              : {}),
          },
          body,
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      try {
        const id = response.headers.get("x-request-id");
        options.onResponseHeaders?.({
          requestId: id && /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : null,
          httpStatus: response.status,
        });
      } catch {
        await response.body?.cancel().catch(() => {});
        throw new AiHttpError("AI_TRACE_PERSIST_FAILED");
      }
      if (!response.ok) {
        // Inspect only a bounded error code in memory. Never retain provider prose.
        let providerCode: unknown;
        try {
          providerCode = (await readBoundedJson(response))?.error?.code;
        } catch {}
        const code =
          response.status === 401
            ? "AI_KEY_REJECTED"
            : response.status === 403
              ? "AI_ACCESS_DENIED"
              : response.status === 429
                ? [
                    "insufficient_quota",
                    "billing_hard_limit_reached",
                    "credit_balance_exhausted",
                  ].includes(String(providerCode))
                  ? "AI_QUOTA_EXHAUSTED"
                  : providerCode === "rate_limit_exceeded"
                    ? "AI_RATE_LIMITED"
                    : "AI_QUOTA_OR_RATE_LIMIT"
                : response.status >= 500
                  ? "AI_PROVIDER_UNAVAILABLE"
                  : "AI_REQUEST_REJECTED";
        const retry = Number(response.headers.get("retry-after"));
        throw new AiHttpError(
          code,
          response.status,
          Number.isFinite(retry) && retry > 0
            ? Math.min(86400, Math.ceil(retry))
            : null,
        );
      }
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      )
        throw new AiHttpError("AI_INVALID_CONTENT_TYPE");
      const raw = await readBoundedJson(response);
      if (!raw || typeof raw !== "object" || raw.model !== syntheticModel)
        throw new AiHttpError("AI_MODEL_MISMATCH");
      const usage = usageTelemetry(raw, response.headers.get("x-request-id"));
      try {
        options.onUsage?.(usage);
      } catch {
        throw new AiHttpError("AI_USAGE_PERSIST_FAILED");
      }
      try {
        options.onResponse?.(raw);
      } catch {
        throw new AiHttpError("AI_EVIDENCE_PERSIST_FAILED");
      }
      return raw;
    } catch (error) {
      if (error instanceof AiHttpError) throw error;
      throw new AiHttpError(
        controller.signal.aborted
          ? "AI_TIMEOUT_UNCERTAIN"
          : "AI_NETWORK_UNCERTAIN",
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
