/** Transport injection defaults to blocked. Optional Toss test HTTP transport is not wired into runtime. */
export type HttpRequest = {
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
};
export type Transport = (request: HttpRequest) => Promise<unknown>;
export const blockedTransport: Transport = async () => {
  throw new Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
};
