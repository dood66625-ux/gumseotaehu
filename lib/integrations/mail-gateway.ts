import type { MailEnvelope } from "../mail-content";
export type MailEvidence = {
  key: string;
  state:
    | "unknown"
    | "not_sent"
    | "accepted"
    | "delivered"
    | "bounced"
    | "complained";
  providerId?: string;
  authoritative?: boolean;
  permanent?: boolean;
};
export type MailGateway = {
  name: string;
  idempotencyWindowMs: number;
  send: (
    message: MailEnvelope,
    key: string,
    signal?: AbortSignal,
  ) => Promise<{ key: string; providerId: string }>;
  lookup: (
    key: string,
    signal?: AbortSignal,
    providerId?: string,
  ) => Promise<MailEvidence>;
};
export const blockedMailGateway: MailGateway = {
  name: "disabled",
  idempotencyWindowMs: 0,
  send: async () => {
    throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
  },
  lookup: async () => {
    throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
  },
};
