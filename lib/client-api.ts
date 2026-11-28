/** Browser transport only. Deadlines never imply server cancellation or trigger retries. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const writing = body !== undefined;
  const unavailable = writing
    ? "요청 결과를 확인하지 못했습니다. 다시 요청하기 전에 결제·접수 내역을 먼저 확인해주세요."
    : "연결이 지연되거나 끊겼습니다. 잠시 후 다시 확인해주세요.";
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new ApiError(unavailable, 0);
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeout);
    }, 20000);
  });
  async function request(target: string, payload?: unknown) {
    // A late session response must never start a mutation after the overall deadline.
    if (controller.signal.aborted) throw timeout;
    const response = await fetch("/api/" + target, {
      method: payload === undefined ? "GET" : "POST",
      headers:
        payload === undefined ? {} : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    let value: any;
    try {
      value = await response.json();
    } catch {
      throw new ApiError(
        response.ok ? unavailable : "요청을 처리하지 못했습니다.",
        response.ok ? 0 : response.status,
      );
    }
    if (controller.signal.aborted) throw timeout;
    if (!response.ok) {
      const message =
        typeof value?.error === "string"
          ? value.error
          : "요청을 처리하지 못했습니다.";
      const internalCode = /^[A-Z][A-Z0-9_]*$/.test(message);
      const adminRequest = path === "admin" || path.startsWith("admin/");
      const customerMessage =
        response.status === 401
          ? "인증이 필요합니다. 다시 로그인하거나 구매 이메일로 인증해주세요."
          : response.status === 429
            ? "요청이 많습니다. 잠시 후 다시 시도해주세요."
            : "요청을 처리하지 못했습니다. 잠시 후 다시 확인해주세요.";
      throw new ApiError(
        internalCode && !adminRequest ? customerMessage : message,
        response.status,
      );
    }
    return value;
  }
  async function perform() {
    if (writing && path !== "session") await request("session", {});
    return request(path, body);
  }
  try {
    return await Promise.race([perform(), deadline]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(unavailable, 0);
  } finally {
    clearTimeout(timer!);
  }
}
